import { DateTime } from 'luxon'
import type { Block } from './state.svelte'
import { zoneLabel } from './timezones'

export const SITE_URL = 'https://timepicker.peterbell.ch'

/** Lead-in for the credit line; the UI renders the URL after it as a real anchor. */
export const ATTRIBUTION_PREFIX = 'Generated with TimePicker -'

/** Trailing credit line, used when there is no saved share link to name the site instead. */
export const ATTRIBUTION = `${ATTRIBUTION_PREFIX} ${SITE_URL}`

/** Lead-in for the saved share link, when one exists. */
export const SHARE_PREFIX = 'View this availability as a calendar:'

export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** "Monday the 20th of July" (year appended when not the current year) */
export function dayHeading(dt: DateTime): string {
  const base = `${dt.weekdayLong} the ${ordinal(dt.day)} of ${dt.monthLong}`
  return dt.year === DateTime.now().year ? base : `${base} ${dt.year}`
}

function hhmm(ms: number, zone: string): string {
  return DateTime.fromMillis(ms, { zone }).toFormat('HH:mm')
}

/** Whole days between the base-zone calendar day and the same instant's day in `zone`. */
function dayShift(ms: number, zone: string, baseDay: DateTime): number {
  const d = DateTime.fromMillis(ms, { zone })
  const local = DateTime.local(d.year, d.month, d.day)
  const base = DateTime.local(baseDay.year, baseDay.month, baseDay.day)
  return Math.round(local.diff(base, 'days').days)
}

function shiftMark(n: number): string {
  if (n === 0) return ''
  return n > 0 ? ` +${n}d` : ` ${n}d`
}

/** "12:00-14:00" — base-zone range; the day heading anchors the date, so no shift marks */
export function baseRange(b: Block, zone: string): string {
  return `${hhmm(b.start, zone)}-${hhmm(b.end, zone)}`
}

/** "08:00-09:00 +1d, *22nd of July*" style range for a non-base zone; the day shift follows the start time */
export function rangeInZone(b: Block, zone: string, baseDay: DateTime): string {
  const s = dayShift(b.start, zone, baseDay)
  const range = `${hhmm(b.start, zone)}-${hhmm(b.end, zone)}${shiftMark(s)}`
  if (s === 0) return range
  const startDay = DateTime.fromMillis(b.start, { zone })
  return `${range}, *${ordinal(startDay.day)} of ${startDay.monthLong}*`
}

/** Group blocks by their base-zone calendar day, sorted. */
export function groupByDay(blocks: Block[], baseZone: string): Map<string, Block[]> {
  const groups = new Map<string, Block[]>()
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  for (const b of sorted) {
    const key = DateTime.fromMillis(b.start, { zone: baseZone }).toISODate()!
    const list = groups.get(key)
    if (list) list.push(b)
    else groups.set(key, [b])
  }
  return groups
}

/** Build the dot-point availability list, one line per day. */
export function buildTextList(blocks: Block[], zones: string[]): string[] {
  if (blocks.length === 0 || zones.length === 0) return []
  const baseZone = zones[0]
  const others = zones.slice(1)
  const lines: string[] = []
  for (const [dayISO, dayBlocks] of groupByDay(blocks, baseZone)) {
    const baseDay = DateTime.fromISO(dayISO, { zone: baseZone })
    const baseRanges = dayBlocks.map((b) => baseRange(b, baseZone)).join(' or ')
    let line = `${dayHeading(baseDay)}, ${baseRanges}`
    if (others.length > 0) {
      const parts = others.map((z) => {
        const ranges = dayBlocks.map((b) => rangeInZone(b, z, baseDay)).join(' or ')
        return `${zoneLabel(z)}: ${ranges}`
      })
      line += ` (${parts.join('; ')})`
    }
    lines.push(line)
  }
  return lines
}

/**
 * Full copyable text including a heading naming the zones. The trailing credit is the
 * share link from "Save & get link" once a snapshot has been saved - it names the site
 * too, so it stands in for the generic credit rather than sitting next to it.
 */
export function buildCopyText(
  blocks: Block[],
  zones: string[],
  shareUrl?: string | null,
): string {
  const lines = buildTextList(blocks, zones)
  if (lines.length === 0) return ''
  const baseName = zoneLabel(zones[0])
  const others = zones.slice(1).map(zoneLabel)
  const heading =
    others.length > 0
      ? `My availability (${baseName} time, ${others.join(' and ')} in brackets):`
      : `My availability (${baseName} time):`
  const footer = shareUrl ? `${SHARE_PREFIX} ${shareUrl}` : ATTRIBUTION
  return [heading, ...lines.map((l) => `- ${l}`), '', footer].join('\n')
}
