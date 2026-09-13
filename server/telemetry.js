// Anonymous usage collector, ported from PCB Spec Template's src/collector.js
// (itself from PCB Colour-Plan's collector/server.mjs, github.com/newfolder0/
// pcb-colourplan). All three follow the same telemetry contract.
//
// Storage is this app's SQLite database rather than an ndjson file: this
// process is already its only writer, and the ops dashboard reads the counts
// through /api/stats.
//
// Privacy by design (see ../PRIVACY.md):
//   - Accepts ONLY {e, v}: an event name from a closed set and a short version
//     string. Unknown keys are dropped; the body is size-capped in index.js.
//   - Uses IP + User-Agent ONLY to compute a daily unique-visitor hash, then
//     discards them. Neither is stored. Stored rows are {ts, e, v}.
//   - The hash lives in memory only, salted per process run, so it cannot be
//     reproduced from anything on disk.
//   - Raw events older than `retentionDays` are pruned daily; the per-day
//     counts and unique totals are kept.

import crypto from 'node:crypto'
import { bumpUnique, pruneTelemetry, recordTelemetry } from './db.js'

export const EVENTS = new Set(['app_open', 'png_download', 'text_copy', 'image_copy'])
export const MAX_BODY_BYTES = 512

// Bound on today's in-memory hashes. Past it, uniques stop being counted for
// the rest of the day, rather than a flood of forged User-Agents growing the
// set without limit.
const MAX_SEEN_PER_DAY = 50_000
const DAY_MS = 24 * 60 * 60 * 1000

/** Allowlist + coerce the client payload. Returns null if invalid. */
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!EVENTS.has(raw.e)) return null
  return { e: raw.e, v: typeof raw.v === 'string' ? raw.v.slice(0, 32) : '' }
}

export function createTelemetry({ retentionDays = 365 } = {}) {
  const runSalt = crypto.randomBytes(32)
  let today = { date: '', seen: new Set() }

  function countUnique(ip, ua, date) {
    if (today.date !== date) today = { date, seen: new Set() }
    if (today.seen.size >= MAX_SEEN_PER_DAY) return
    const hash = crypto
      .createHash('sha256')
      .update(runSalt)
      .update(date)
      .update(ip)
      .update('\0')
      .update(ua)
      .digest('hex')
    if (today.seen.has(hash)) return
    today.seen.add(hash)
    bumpUnique(date)
  }

  return {
    /** Store one sanitized event. IP and User-Agent feed only the unstored hash. */
    record(payload, ip, ua, now = new Date()) {
      const ts = now.toISOString()
      recordTelemetry(ts, payload.e, payload.v)
      countUnique(String(ip), String(ua), ts.slice(0, 10))
    },

    /** Drop raw rows older than the retention window. Returns rows deleted. */
    prune(now = Date.now()) {
      return pruneTelemetry(new Date(now - retentionDays * DAY_MS).toISOString())
    },
  }
}
