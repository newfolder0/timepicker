import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data')
fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'timepicker.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS shares (
    slug TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stats (
    date TEXT NOT NULL,
    event TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, event)
  );
  -- Consented usage events (see ../PRIVACY.md): {ts, e, v} and nothing else,
  -- pruned after the retention window. Their per-day counts live in stats.
  CREATE TABLE IF NOT EXISTS telemetry_events (
    ts TEXT NOT NULL,
    e TEXT NOT NULL,
    v TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS telemetry_events_ts ON telemetry_events (ts);
  -- Estimated unique visitors per day: a number, never an identifier.
  CREATE TABLE IF NOT EXISTS telemetry_uniques (
    date TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
  );
`)

const insertShare = db.prepare(
  'INSERT INTO shares (slug, payload, created_at, expires_at) VALUES (?, ?, ?, ?)',
)
const selectShare = db.prepare('SELECT payload, expires_at FROM shares WHERE slug = ?')
const deleteExpired = db.prepare('DELETE FROM shares WHERE expires_at < ?')
const bumpStat = db.prepare(`
  INSERT INTO stats (date, event, count) VALUES (?, ?, 1)
  ON CONFLICT(date, event) DO UPDATE SET count = count + 1
`)
const selectStats = db.prepare(
  'SELECT date, event, count FROM stats WHERE date >= ? ORDER BY date',
)
const countLiveShares = db.prepare('SELECT COUNT(*) AS n FROM shares WHERE expires_at >= ?')
const insertTelemetry = db.prepare('INSERT INTO telemetry_events (ts, e, v) VALUES (?, ?, ?)')
const deleteOldTelemetry = db.prepare('DELETE FROM telemetry_events WHERE ts < ?')
const bumpUniqueStmt = db.prepare(`
  INSERT INTO telemetry_uniques (date, count) VALUES (?, 1)
  ON CONFLICT(date) DO UPDATE SET count = count + 1
`)
const selectUniques = db.prepare(
  'SELECT date, count FROM telemetry_uniques WHERE date >= ? ORDER BY date',
)

export function createShare(slug, payload, expiresAt) {
  insertShare.run(slug, JSON.stringify(payload), Date.now(), expiresAt)
}

export function getShare(slug) {
  const row = selectShare.get(slug)
  if (!row) return { status: 'missing' }
  if (row.expires_at < Date.now()) return { status: 'expired' }
  return { status: 'ok', payload: JSON.parse(row.payload) }
}

export function sweepExpired() {
  const { changes } = deleteExpired.run(Date.now())
  if (changes > 0) console.log(`sweep: deleted ${changes} expired share(s)`)
}

/** Aggregate daily counters only - no IPs, no user agents, nothing per-person. */
export function recordEvent(event) {
  const date = new Date().toISOString().slice(0, 10)
  try {
    bumpStat.run(date, event)
  } catch {
    // stats are best-effort
  }
}

const recordTelemetryTx = db.transaction((ts, e, v) => {
  insertTelemetry.run(ts, e, v)
  bumpStat.run(ts.slice(0, 10), e)
})

/** One consented usage event, already sanitized: the raw row plus its daily count. */
export function recordTelemetry(ts, e, v) {
  recordTelemetryTx(ts, e, v)
}

export function bumpUnique(date) {
  bumpUniqueStmt.run(date)
}

/** Delete raw telemetry rows older than `cutoffIso`. Daily counts are kept. */
export function pruneTelemetry(cutoffIso) {
  return deleteOldTelemetry.run(cutoffIso).changes
}

/**
 * Aggregate counters for the ops dashboard, which cannot read this database
 * directly: SQLite in WAL mode needs WRITE access to the -shm file, so a
 * read-only mount cannot open it at all. Serving the numbers over the API is
 * the honest way round that, and keeps this process the only writer.
 *
 * Returns counts per day and in total, plus estimated unique visitors per day
 * (`daily[].uniques`). `totals.uniqueVisitors` sums those days, so one person
 * returning on three days counts three times - the same meaning as PCB
 * Colour-Plan's figure. No IPs, no user agents, nothing per-person - there is
 * nothing of that kind in the tables to return.
 */
export function statsSummary(since = '0000-00-00') {
  const totals = {}
  const byDate = new Map()
  const day = (date) => {
    if (!byDate.has(date)) byDate.set(date, { date })
    return byDate.get(date)
  }
  for (const row of selectStats.all(since)) {
    totals[row.event] = (totals[row.event] ?? 0) + row.count
    day(row.date)[row.event] = row.count
  }
  let uniqueVisitors = 0
  for (const row of selectUniques.all(since)) {
    uniqueVisitors += row.count
    day(row.date).uniques = row.count
  }
  totals.uniqueVisitors = uniqueVisitors
  return {
    daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totals,
    activeShares: countLiveShares.get(Date.now()).n,
  }
}
