# TimePicker

Web app for composing meeting-availability emails. Drag-select availability blocks on a
week calendar, see the times in up to three time zones at once, copy a ready-made
dot-point list (or a PNG of the calendar) into an email, and optionally publish a
read-only snapshot at a short link that expires automatically.

Hosted at [timepicker.peterbell.ch](https://timepicker.peterbell.ch). Free software under
the [MIT Licence](LICENSE).

> **⚠ AI-built.** This app was developed using AI and has not been carefully vetted for
> security or correctness by a human. Check every time and time zone before you send it.

## Features

- Week view (Mon-Sun) styled like a desktop calendar app, with ISO week number
- Click-and-drag to create blocks (30-min snap); drag to move, resize from the edges,
  hover + × to delete; overlapping blocks merge
- Base time zone plus optional second/third zones shown on the left axis and on every
  block; quick radio buttons (the `QUICK_ZONES` list in `frontend/src/lib/timezones.ts`)
  plus a dropdown with the complete IANA zone list
- Live dot-point text list with all selected zones and day-shift markers (`+1d`),
  closing with a credit line pointing at `timepicker.peterbell.ch`. Once a snapshot
  has been saved the share link replaces that credit - it names the site too - and
  any edit reverts to the plain credit, so a stale link is never copied
- Export: download calendar as PNG, copy the text list, or copy both to the clipboard;
  a clear button dumps every block at once
- "Save & get link" publishes a read-only snapshot at `/<5-char-slug>`; the row is
  deleted from the database once the last block's end time has passed

## Privacy

Full notice: [PRIVACY.md](PRIVACY.md). In short: no cookies, no accounts. Selected blocks
live in memory only - a reload starts from an empty calendar. Shared snapshots contain
only block times and zone names. The server keeps plain daily counters (page views /
shares created / shares viewed) with nothing per-person.

The hosted instance also collects a small set of **consented** anonymous usage events,
following the same design as the author's other hosted tools:

- A consent wall on first visit. Declining points to self-hosting; withdrawing is one
  click under **Privacy & data** in the footer.
- The browser sends `{e, v}` only - an event name from a closed set (`app_open`,
  `png_download`, `text_copy`, `image_copy`) and the app version - to a same-origin
  `POST /collect`.
- The server uses IP + User-Agent only for an in-memory, per-run-salted daily
  unique-visitor hash, then discards them. Stored rows are `{ts, e, v}`, pruned after
  `TELEMETRY_RETENTION_DAYS` (default 365); daily totals are kept.

**Telemetry is off by default.** Without `TELEMETRY=1` there is no wall, the page
carries no endpoint and `/collect` does not exist.

## Self-hosting

```sh
git clone https://github.com/newfolder0/timepicker
cd timepicker
docker build -t timepicker .
docker run -d -p 127.0.0.1:3000:3000 -v timepicker-data:/app/server/data timepicker
# then open http://localhost:3000
```

Put a TLS-terminating reverse proxy in front of it before exposing it beyond localhost;
the server trusts one proxy hop for client IPs (rate limiting).

Configuration (environment variables, all optional):

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3000` | listen port |
| `DATA_DIR` | `server/data` | SQLite location (`/app/server/data` in the image) |
| `TELEMETRY` | off | `1` enables the consent wall and `POST /collect` |
| `TELEMETRY_RETENTION_DAYS` | `365` | raw telemetry rows older than this are pruned daily |
| `CONTACT_EMAIL` | none | shown in the footer, consent wall and privacy panel |
| `DATA_CONTROLLER` | none | shown in the privacy notice |
| `SELF_HOST_URL` | this repo | where the consent wall sends people who decline |
| `STATS_TOKEN` | none | enables `GET /api/stats` (see below) |

## Development

```sh
node server/index.js           # API on :3000
cd frontend && npm run dev     # Vite on :5173, proxies /api and /collect to :3000
```

The Vite dev server does not inject the runtime config, so the consent wall only
appears when the built page is served by the server:

```sh
(cd frontend && npm run build) && TELEMETRY=1 node server/index.js
```

Checks:

```sh
cd frontend && npm run check && npm run build
cd server && npm run selftest   # needs the frontend build
```

## Usage stats endpoint

`GET /api/stats` returns the aggregate daily counters, unique-visitor totals and the
live share count as JSON, for an ops dashboard. It **fails closed**: with no
`STATS_TOKEN` in the environment the route 404s, so it publishes nothing unless
deliberately switched on. With one set, callers must present
`Authorization: Bearer <token>`, compared as SHA-256 digests in constant time.

It exists because this database cannot be read from outside the container: SQLite in
WAL mode requires write access to the `-shm` file, so a read-only volume mount cannot
open it at all.

The share API is rate-limited (20 saves/hour/IP, held in memory only), payloads are
schema-validated and capped at 50 KB, and expired shares are swept hourly. See
[SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability.

## Production

The hosted instance is deployed with the author's `deploy-webapp` flow; its operational
notes live in a private infrastructure repository, not here.
