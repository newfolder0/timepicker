// Opt-in anonymous usage telemetry. Mirrors PCB Colour-Plan's src/telemetry.ts
// (github.com/newfolder0/pcb-colourplan); see ../../../PRIVACY.md.
//
// The server injects its configuration into index.html as inert JSON
// (<script type="application/json" id="cfg">), so the CSP needs no exemption
// and TELEMETRY stays a runtime switch. With no endpoint in that config there
// is no consent wall and track() is a hard no-op, whatever localStorage says.

export interface ClientCfg {
  telemetryEndpoint: string
  version: string
  retentionDays: number
  contactEmail: string
  dataController: string
  selfHostUrl: string
}

const DEFAULT_SELF_HOST = 'https://github.com/newfolder0/timepicker'

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function readCfg(): ClientCfg {
  let raw: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(document.getElementById('cfg')?.textContent || '{}')
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>
  } catch {
    // no or unreadable config: behave as a copy with telemetry off
  }
  const endpoint = str(raw.telemetryEndpoint)
  const selfHost = str(raw.selfHostUrl)
  return {
    // same-origin paths only
    telemetryEndpoint: endpoint.startsWith('/') && !endpoint.startsWith('//') ? endpoint : '',
    version: str(raw.version) || 'dev',
    retentionDays: Number(raw.retentionDays) > 0 ? Math.round(Number(raw.retentionDays)) : 365,
    contactEmail: str(raw.contactEmail),
    dataController: str(raw.dataController),
    selfHostUrl: selfHost.startsWith('https://') ? selfHost : DEFAULT_SELF_HOST,
  }
}

export const cfg = readCfg()
export const TELEMETRY_ENABLED = cfg.telemetryEndpoint !== ''

export type Consent = 'granted' | 'denied'

// Bump the suffix when what is collected changes materially, so people are
// asked again rather than silently opted in.
const CONSENT_KEY = 'tp_analytics_consent_v1'

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

export function setConsent(c: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, c)
  } catch {
    // storage blocked: nothing is sent, since track() re-reads the stored choice
  }
}

export type TelemetryEvent = 'app_open' | 'png_download' | 'text_copy' | 'image_copy'
const EVENTS: readonly TelemetryEvent[] = ['app_open', 'png_download', 'text_copy', 'image_copy']

/** The wire format is exactly {e, v}. There is no code path that puts calendar data here. */
export function track(e: TelemetryEvent): void {
  if (!TELEMETRY_ENABLED || !EVENTS.includes(e) || getConsent() !== 'granted') return
  try {
    // keepalive lets it complete past navigation; failures (offline, no
    // server in dev) are swallowed - telemetry must never disrupt use
    void fetch(cfg.telemetryEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ e, v: cfg.version }),
      keepalive: true,
      mode: 'same-origin',
      cache: 'no-store',
    }).catch(() => {})
  } catch {
    // ignore
  }
}

let openSent = false
export function trackAppOpen(): void {
  if (openSent) return // once per page load
  openSent = true
  track('app_open')
}
