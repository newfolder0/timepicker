# Security Policy

## Reporting a vulnerability

Please report security issues **privately** - do not open a public issue.

Use GitHub's private vulnerability reporting: open the **Security** tab of this
repository and click **"Report a vulnerability"**. This opens a private channel
with the maintainer.

Please include:

- a description of the issue and its impact,
- steps to reproduce, and
- the affected version or commit.

I aim to acknowledge reports within a few days and will keep you updated on a
fix. Please allow reasonable time for a fix to ship before any public disclosure.

## Scope and threat model

- **The calendar runs client-side.** Drawing blocks, time zone conversion, the
  text list and the PNG export all happen in the browser tab; nothing is sent
  while you do them.
- **Share API** (`POST /api/share`, `GET /api/share/:slug`): schema-validated,
  capped at 50 KB and 100 blocks, rate-limited per IP (in memory), and deleted
  once the last block has ended. Links are 5 random characters: unlisted, not
  secret.
- **`GET /api/stats`**: aggregate counters for an ops dashboard, bearer-token
  gated with a constant-time comparison, and a 404 unless a token is configured.
- **`POST /collect`** (only when `TELEMETRY=1`): accepts a closed allowlist
  `{e, v}`, capped at 512 bytes and rate-limited; stores no IP address or
  User-Agent.
- `helmet` sets a `default-src 'self'` Content-Security-Policy, so the page
  cannot talk to any other origin.

Reports I'm particularly interested in: XSS via share payloads (zone names reach
the DOM), bypassing share validation or expiry, the stats token check, and any
way to make `/collect` store or leak unintended data.
