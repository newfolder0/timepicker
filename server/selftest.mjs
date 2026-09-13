// Self-test for the server: /collect contract, fail-closed telemetry, cfg
// injection, stats, and that the share API is unaffected. No dependencies
// beyond the server's own. Build the frontend first:
//
//   (cd frontend && npm run build) && (cd server && npm run selftest)
//
// Spawns index.js on free ports with throwaway data directories.

import { once } from 'node:events'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'))
if (!fs.existsSync(path.resolve(serverDir, '../frontend/dist/index.html'))) {
  console.error('frontend/dist/index.html missing - run `npm run build` in frontend/ first')
  process.exit(2)
}

let failures = 0
function check(name, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  if (!ok) failures++
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'timepicker-selftest-'))

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

// Only the variables given here reach the child, so nothing in the calling
// shell (a stray TELEMETRY=1, say) can change what is being tested.
async function start(env) {
  const port = await freePort()
  const dataDir = tmpDir()
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10_000)
    child.stdout.on('data', (buf) => {
      if (String(buf).includes('listening')) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.on('exit', (code) => reject(new Error(`server exited with ${code}`)))
  })
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      child.kill()
      await once(child, 'exit')
      fs.rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

function cfgOf(html) {
  const m = html.match(/<script type="application\/json" id="cfg">([^<]*)<\/script>/)
  return m ? JSON.parse(m[1]) : null
}

const JSON_TYPE = { 'content-type': 'application/json' }
function collect(base, body, headers = JSON_TYPE) {
  return fetch(`${base}/collect`, { method: 'POST', headers, body })
}

// ---- units: sanitize and retention ---------------------------------------

process.env.DATA_DIR = tmpDir()
const { sanitize, createTelemetry } = await import('./telemetry.js')
const db = await import('./db.js')

check(
  'sanitize keeps only e and v',
  JSON.stringify(sanitize({ e: 'text_copy', v: '1', ip: 'x' })) === '{"e":"text_copy","v":"1"}',
)
check(
  'sanitize truncates v and blanks a non-string v',
  sanitize({ e: 'app_open', v: 'x'.repeat(99) }).v.length === 32 &&
    sanitize({ e: 'app_open', v: 5 }).v === '',
)
check(
  'sanitize rejects null, arrays, strings and unknown events',
  [null, [], 'app_open', { e: 'print' }, { e: 'toString' }].every((x) => sanitize(x) === null),
)

const unit = createTelemetry({ retentionDays: 30 })
unit.record({ e: 'app_open', v: 't' }, '127.0.0.1', 'ua', new Date(Date.now() - 40 * 864e5))
unit.record({ e: 'app_open', v: 't' }, '127.0.0.1', 'ua')
check('prune drops raw rows past retention, and only those', unit.prune() === 1 && unit.prune() === 0)
check('prune keeps the daily counts', db.statsSummary().totals.app_open === 2)
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true })

// ---- telemetry on --------------------------------------------------------

const A = await start({
  TELEMETRY: '1',
  STATS_TOKEN: 'selftest-token',
  CONTACT_EMAIL: 'bugs@example.invalid',
  DATA_CONTROLLER: 'Test </script><b>$& Ltd',
})
try {
  const home = await fetch(`${A.base}/`)
  const html = await home.text()
  const cfg = cfgOf(html)
  check('GET / serves the page', home.status === 200)
  check(
    'cfg on / carries endpoint, contact and version',
    cfg?.telemetryEndpoint === '/collect' &&
      cfg.contactEmail === 'bugs@example.invalid' &&
      cfg.version === pkg.version,
  )
  check(
    'cfg cannot close its script tag, and $& is not a replace pattern',
    !html.includes('</script><b>') && cfg?.dataController === 'Test </script><b>$& Ltd',
  )
  check(
    'page keeps its CSP and no-referrer policy',
    (home.headers.get('content-security-policy') || '').includes("default-src 'self'") &&
      home.headers.get('referrer-policy') === 'no-referrer',
  )
  check(
    'cfg is injected on /:slug too',
    cfgOf(await (await fetch(`${A.base}/abcde`)).text())?.telemetryEndpoint === '/collect',
  )
  const raw = await fetch(`${A.base}/index.html`, { redirect: 'manual' })
  check('/index.html redirects to the injected page', raw.status === 301 && raw.headers.get('location') === '/')

  const ok = await collect(A.base, JSON.stringify({ e: 'app_open', v: '9.9.9', extra: 'dropped' }))
  check('valid event -> 204, no-store', ok.status === 204 && ok.headers.get('cache-control') === 'no-store')
  check('unknown event -> 422', (await collect(A.base, JSON.stringify({ e: 'nope' }))).status === 422)
  check('array body -> 422', (await collect(A.base, '[]')).status === 422)
  check(
    'non-JSON -> 415',
    (await collect(A.base, 'e=app_open', { 'content-type': 'text/plain' })).status === 415,
  )
  check('malformed JSON -> 400', (await collect(A.base, '{"e":')).status === 400)
  check(
    'oversized body -> 413',
    (await collect(A.base, JSON.stringify({ e: 'app_open', v: 'x'.repeat(600) }))).status === 413,
  )
  const get = await fetch(`${A.base}/collect`)
  check('GET /collect -> 405 with Allow: POST', get.status === 405 && get.headers.get('allow') === 'POST')

  // same IP + User-Agent as the app_open above, then a different User-Agent
  await collect(A.base, JSON.stringify({ e: 'text_copy', v: '9.9.9' }))
  await collect(
    A.base,
    JSON.stringify({ e: 'png_download', v: '9.9.9' }),
    { ...JSON_TYPE, 'user-agent': 'selftest-other-agent' },
  )

  const share = await fetch(`${A.base}/api/share`, {
    method: 'POST',
    headers: JSON_TYPE,
    body: JSON.stringify({
      blocks: [{ start: Date.now() + 3600e3, end: Date.now() + 7200e3 }],
      zones: { base: 'Europe/London', second: null, third: null },
      padding: 'x'.repeat(2000),
    }),
  })
  check('share API still accepts bodies well over the /collect cap', share.status === 200)

  const stats = await (
    await fetch(`${A.base}/api/stats`, { headers: { authorization: 'Bearer selftest-token' } })
  ).json()
  const t = stats.totals
  check('stats count the consented events', t.app_open === 1 && t.text_copy === 1 && t.png_download === 1)
  check('rejected events are not counted', !('nope' in t))
  check(
    'unique visitors: same IP+UA once, a new UA again',
    t.uniqueVisitors === 2 && stats.daily.at(-1)?.uniques === 2,
  )
  check('server-side counters unchanged', t.page_view === 1 && t.share_created === 1)
} finally {
  await A.stop()
}

// ---- telemetry off (the default) -----------------------------------------

const B = await start({})
try {
  const cfg = cfgOf(await (await fetch(`${B.base}/`)).text())
  check('default: no telemetry endpoint in cfg', cfg?.telemetryEndpoint === '')
  check('default: POST /collect -> 404', (await collect(B.base, JSON.stringify({ e: 'app_open' }))).status === 404)
  check('default: GET /collect -> 404', (await fetch(`${B.base}/collect`)).status === 404)
  check('default: /api/stats stays closed', (await fetch(`${B.base}/api/stats`)).status === 404)
} finally {
  await B.stop()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
