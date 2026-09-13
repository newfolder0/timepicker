import { DateTime } from 'luxon'

export interface Block {
  id: string
  start: number // epoch ms UTC
  end: number // epoch ms UTC
}

// Only zone preferences are persisted - blocks are deliberately session-only, so a
// reload always starts from an empty calendar.
interface Persisted {
  baseZone: string
  secondZone: string | null
  thirdZone: string | null
}

const STORAGE_KEY = 'timepicker-v1'

function load(): Persisted {
  const defaults: Persisted = {
    baseZone: 'Europe/London',
    secondZone: 'Europe/Zurich',
    thirdZone: null,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const p = JSON.parse(raw)
    const zones: Persisted = {
      baseZone: typeof p.baseZone === 'string' ? p.baseZone : defaults.baseZone,
      secondZone: typeof p.secondZone === 'string' ? p.secondZone : null,
      thirdZone: typeof p.thirdZone === 'string' ? p.thirdZone : null,
    }
    // drop blocks written by older versions rather than leaving them on disk
    if ('blocks' in p) localStorage.setItem(STORAGE_KEY, JSON.stringify(zones))
    return zones
  } catch {
    return defaults
  }
}

const initial = load()

export const app = $state({
  blocks: [] as Block[],
  baseZone: initial.baseZone,
  secondZone: initial.secondZone as string | null,
  thirdZone: initial.thirdZone as string | null,
  weekStartISO: DateTime.now().setZone(initial.baseZone).startOf('week').toISODate()!,
  readOnly: false,
  // set by "Save & get link"; `sig` is what was saved, so an edit since then is detectable
  share: null as { url: string; sig: string } | null,
})

export function persist() {
  if (app.readOnly) return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        baseZone: app.baseZone,
        secondZone: app.secondZone,
        thirdZone: app.thirdZone,
      }),
    )
  } catch {
    // storage unavailable - zone choices just won't survive reload
  }
}

/** Monday 00:00 of the displayed week, in the base zone. */
export function weekStart(): DateTime {
  return DateTime.fromISO(app.weekStartISO, { zone: app.baseZone }).startOf('day')
}

export function shiftWeek(deltaWeeks: number) {
  app.weekStartISO = weekStart().plus({ weeks: deltaWeeks }).toISODate()!
}

export function goToday() {
  app.weekStartISO = DateTime.now().setZone(app.baseZone).startOf('week').toISODate()!
}

/** Selected zones, base first, without gaps. */
export function selectedZones(): string[] {
  const z = [app.baseZone]
  if (app.secondZone) z.push(app.secondZone)
  if (app.thirdZone) z.push(app.thirdZone)
  return z
}

/** Everything a saved snapshot captures, so a link that no longer matches can be spotted. */
export function shareSignature(): string {
  return JSON.stringify({
    blocks: app.blocks.map((b) => [b.start, b.end]),
    zones: selectedZones(),
  })
}

/** The saved share link, or null if nothing was saved or the calendar changed since. */
export function activeShareUrl(): string | null {
  if (!app.share) return null
  return app.share.sig === shareSignature() ? app.share.url : null
}

function normalize() {
  const sorted = [...app.blocks].sort((a, b) => a.start - b.start)
  const merged: Block[] = []
  for (const b of sorted) {
    const last = merged[merged.length - 1]
    if (last && b.start <= last.end) {
      last.end = Math.max(last.end, b.end)
    } else {
      merged.push({ ...b })
    }
  }
  app.blocks = merged
}

let nextId = Date.now()

export function addBlock(start: number, end: number) {
  if (app.readOnly || end <= start) return
  app.blocks.push({ id: String(nextId++), start, end })
  normalize()
}

export function updateBlock(id: string, start: number, end: number) {
  if (app.readOnly || end <= start) return
  const b = app.blocks.find((b) => b.id === id)
  if (!b) return
  b.start = start
  b.end = end
  normalize()
}

export function removeBlock(id: string) {
  if (app.readOnly) return
  app.blocks = app.blocks.filter((b) => b.id !== id)
}

export function clearBlocks() {
  if (app.readOnly) return
  app.blocks = []
  app.share = null
}
