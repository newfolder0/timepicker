import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createShare, getShare, sweepExpired, recordEvent, statsSummary } from './db.js'
import { createTelemetry, sanitize, MAX_BODY_BYTES } from './telemetry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const { version: VERSION } = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'),
)

// Opt-in usage telemetry. FAILS CLOSED, like /api/stats: unless TELEMETRY=1
// the /collect route does not exist, the page carries no endpoint and shows no
// consent wall - so a self-hosted copy sends nothing anywhere by default.
const TELEMETRY = process.env.TELEMETRY === '1'
const RETENTION_DAYS = Number(process.env.TELEMETRY_RETENTION_DAYS) > 0
  ? Math.round(Number(process.env.TELEMETRY_RETENTION_DAYS))
  : 365
const telemetry = TELEMETRY ? createTelemetry({ retentionDays: RETENTION_DAYS }) : null

// Runtime configuration for the page, injected into index.html as inert JSON
// (not executed, so the CSP needs no exemption).
const clientCfg = {
  telemetryEndpoint: TELEMETRY ? '/collect' : '',
  version: VERSION,
  retentionDays: RETENTION_DAYS,
  contactEmail: (process.env.CONTACT_EMAIL || '').trim(),
  dataController: (process.env.DATA_CONTROLLER || '').trim(),
  selfHostUrl: (process.env.SELF_HOST_URL || 'https://github.com/newfolder0/timepicker').trim(),
}

const app = express()
app.disable('x-powered-by')
// behind Caddy in production - trust the immediate proxy for req.ip (rate limiting)
app.set('trust proxy', 1)
app.use(helmet())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// ---- share API -----------------------------------------------------------

const SLUG_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789' // no 0/o/1/l
const SLUG_RE = /^[a-z2-9]{5}$/

function randomSlug() {
  const bytes = crypto.randomBytes(5)
  let s = ''
  for (const b of bytes) s += SLUG_CHARS[b % SLUG_CHARS.length]
  return s
}

const MAX_BLOCKS = 100
const MAX_AGE_MS = 366 * 24 * 3600 * 1000 // refuse payloads ending >1 year out

function validateZone(z) {
  if (typeof z !== 'string' || z.length > 64) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: z })
    return true
  } catch {
    return false
  }
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return null
  const { blocks, zones } = body
  if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > MAX_BLOCKS) return null
  const clean = []
  for (const b of blocks) {
    if (!b || typeof b.start !== 'number' || typeof b.end !== 'number') return null
    if (!Number.isFinite(b.start) || !Number.isFinite(b.end)) return null
    if (b.end <= b.start) return null
    if (b.end > Date.now() + MAX_AGE_MS) return null
    clean.push({ start: Math.round(b.start), end: Math.round(b.end) })
  }
  if (!zones || typeof zones !== 'object' || !validateZone(zones.base)) return null
  const second = zones.second != null ? zones.second : null
  const third = zones.third != null ? zones.third : null
  if (second !== null && !validateZone(second)) return null
  if (third !== null && !validateZone(third)) return null
  return { blocks: clean, zones: { base: zones.base, second, third } }
}

const shareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many saves - try again later.' },
})

// body parsers are per route: /collect has a far smaller cap than shares
const shareJson = express.json({ limit: '50kb' })

app.post('/api/share', shareLimiter, shareJson, (req, res) => {
  const payload = validatePayload(req.body)
  if (!payload) return res.status(400).json({ error: 'Invalid availability payload.' })
  const expiresAt = Math.max(...payload.blocks.map((b) => b.end))
  if (expiresAt < Date.now()) {
    return res.status(400).json({ error: 'All blocks are in the past - nothing to share.' })
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug()
    try {
      createShare(slug, payload, expiresAt)
      recordEvent('share_created')
      return res.json({ slug })
    } catch (e) {
      if (e && e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') continue // collision - retry
      console.error('share create failed:', e)
      return res.status(500).json({ error: 'Could not save.' })
    }
  }
  return res.status(500).json({ error: 'Could not allocate a link - try again.' })
})

app.get('/api/share/:slug', (req, res) => {
  if (!SLUG_RE.test(req.params.slug)) return res.status(404).json({ error: 'Not found.' })
  const result = getShare(req.params.slug)
  if (result.status === 'missing') return res.status(404).json({ error: 'Not found.' })
  if (result.status === 'expired') return res.status(410).json({ error: 'Expired.' })
  recordEvent('share_viewed')
  return res.json(result.payload)
})

// Aggregate daily counters, for the ops dashboard on the edge network.
//
// FAILS CLOSED: with no STATS_TOKEN in the environment the route 404s, so
// deploying this cannot accidentally start publishing anything. The numbers are
// aggregate-only and would be harmless in public, but "harmless" is a judgement
// that should not be re-made by every future reader of this file.
const STATS_TOKEN = process.env.STATS_TOKEN || ''
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

app.get('/api/stats', (req, res) => {
  if (!STATS_TOKEN) return res.status(404).json({ error: 'Not found.' })

  const header = String(req.get('authorization') || '')
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Compare digests, not the raw strings: timingSafeEqual throws on a length
  // mismatch, and guarding that with a length check would leak the token length.
  const a = crypto.createHash('sha256').update(presented).digest()
  const b = crypto.createHash('sha256').update(STATS_TOKEN).digest()
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized.' })

  const since = DATE_RE.test(req.query.since || '') ? req.query.since : '0000-00-00'
  res.set('Cache-Control', 'no-store')
  return res.json(statsSummary(since))
})

// ---- usage telemetry (consented, see ../PRIVACY.md) ----------------------

// Generous for real use (a handful of events per visit), but stops one client
// turning the endpoint into a write flood on the database. IPs held in memory.
const collectLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many events.' },
})
const collectJson = express.json({ limit: MAX_BODY_BYTES })

app.all(
  '/collect',
  // telemetry off: fall through, so the route does not exist at all
  (_req, _res, next) => next(telemetry ? undefined : 'route'),
  collectLimiter,
  (req, res, next) => {
    if (req.method !== 'POST') return res.set('Allow', 'POST').status(405).end()
    if (!req.is('application/json')) return res.status(415).end()
    return next()
  },
  collectJson,
  (req, res) => {
    const payload = sanitize(req.body)
    if (!payload) return res.status(422).end()
    try {
      telemetry.record(payload, req.ip ?? '', req.get('user-agent') ?? '')
    } catch (e) {
      console.error('telemetry write failed:', e.message)
    }
    return res.set('Cache-Control', 'no-store').status(204).end()
  },
  // body-parser errors: oversize -> 413, anything else malformed -> 400
  (err, _req, res, _next) => res.status(err.type === 'entity.too.large' ? 413 : 400).end(),
)

// ---- static frontend -----------------------------------------------------

const dist = path.resolve(__dirname, '../frontend/dist')
const CFG_PLACEHOLDER = '<script type="application/json" id="cfg">{}</script>'

// JSON inside <script> must not be able to close the tag or trip the parser.
function jsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

let page = null
function renderPage() {
  if (page === null) {
    const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
    if (!template.includes(CFG_PLACEHOLDER)) {
      throw new Error('frontend/dist/index.html has no cfg placeholder')
    }
    // function replacement: a '$' in an env value must not act as a pattern
    const tag = `<script type="application/json" id="cfg">${jsonForScript(clientCfg)}</script>`
    page = template.replace(CFG_PLACEHOLDER, () => tag)
  }
  return page
}

function sendPage(res) {
  res.type('html').set('Cache-Control', 'no-cache').send(renderPage())
}

// the raw build output carries an empty cfg - always serve the injected page
app.get('/index.html', (_req, res) => res.redirect(301, '/'))
app.use(express.static(dist, { index: false }))

app.get('/', (_req, res) => {
  recordEvent('page_view')
  sendPage(res)
})

// short share URLs serve the SPA, which fetches /api/share/:slug itself
app.get('/:slug', (req, res, next) => {
  if (!SLUG_RE.test(req.params.slug)) return next()
  sendPage(res)
})

// ---- housekeeping --------------------------------------------------------

sweepExpired()
setInterval(sweepExpired, 60 * 60 * 1000).unref()

if (telemetry) {
  const prune = () => {
    try {
      const n = telemetry.prune()
      if (n > 0) console.log(`telemetry: pruned ${n} event(s) older than ${RETENTION_DAYS} days`)
    } catch (e) {
      console.error('telemetry prune failed:', e.message)
    }
  }
  prune()
  setInterval(prune, 24 * 60 * 60 * 1000).unref()
}

app.listen(PORT, () =>
  console.log(`timepicker server listening on :${PORT} (telemetry ${TELEMETRY ? 'on' : 'off'})`),
)
