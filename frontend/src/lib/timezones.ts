export interface ZoneOption {
  label: string
  short: string
  iana: string
}

// Quick-pick zones (customised set)
export const QUICK_ZONES: ZoneOption[] = [
  { label: 'UK', short: 'UK', iana: 'Europe/London' },
  { label: 'Geneva', short: 'GVA', iana: 'Europe/Zurich' },
  { label: 'Melbourne', short: 'MEL', iana: 'Australia/Melbourne' },
  { label: 'Brisbane', short: 'BNE', iana: 'Australia/Brisbane' },
  { label: 'Darwin', short: 'DRW', iana: 'Australia/Darwin' },
  { label: 'Dallas', short: 'DFW', iana: 'America/Chicago' },
]

export const ALL_ZONES: string[] = Intl.supportedValuesOf('timeZone')

export function zoneShort(iana: string): string {
  const q = QUICK_ZONES.find((z) => z.iana === iana)
  if (q) return q.short
  const city = iana.split('/').pop() ?? iana
  return city.replace(/_/g, ' ')
}

export function zoneLabel(iana: string): string {
  const q = QUICK_ZONES.find((z) => z.iana === iana)
  if (q) return q.label
  const city = iana.split('/').pop() ?? iana
  return city.replace(/_/g, ' ')
}
