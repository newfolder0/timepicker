# Privacy Notice - TimePicker

_Last updated: 2026-09-13_

## In short

- **Your availability stays in your browser while you work.** The blocks you
  draw are held in the page's memory and cleared on reload. Nothing is uploaded
  unless you press **Save & get link**.
- **The hosted instance is funded by anonymous usage data.** Using the free
  hosted tool requires agreeing to a small set of anonymous events (listed
  below). If you would rather not, run your own copy: TimePicker is free,
  open-source software, and a self-hosted copy sends nothing to this server.
- You can withdraw at any time from **Privacy & data** in the footer; because
  the hosted tool is conditioned on the data, withdrawing returns you to that
  choice (agree, or run your own copy).

## Who is responsible

Data controller: the operator shown in the app's consent wall and privacy panel
(`DATA_CONTROLLER`). Contact: the address shown there (`CONTACT_EMAIL`).

## What stays in your browser

The availability blocks you draw, in page memory only. In `localStorage` (never
cookies, never transmitted): your time zone choices (`timepicker-v1`) and your
analytics choice (`tp_analytics_consent_v1`).

## Share links

Pressing **Save & get link** sends the start and end time of each block and the
selected zone names to the server, which stores them under a random
five-character link. Nothing else is stored with them: no IP address, no browser
details. The row is deleted automatically once the last block has ended. Anyone
with the link can open it, so treat it like the email you paste it into.

## Anonymous usage statistics (hosted instance)

When you open the hosted tool, download the calendar image, or copy the text or
the image, the browser sends one event. **Legal basis: your consent** (GDPR
Art. 6(1)(a); UK PECR reg. 6), requested before anything is sent. A genuine,
equivalent, free alternative is offered - running your own copy - so the choice
is real.

| Field | Source | Notes |
|---|---|---|
| Date/time of the request | server | not sent by your browser |
| App version | browser | e.g. `1.1.0` |
| Event name | browser | `app_open`, `png_download`, `text_copy`, `image_copy` |

**Unique-visitor estimate:** the server computes a daily-rotating, salted hash
of IP + User-Agent purely to estimate how many different people use the tool.
The raw IP/User-Agent and the hash are **not stored**; only the per-day total
is kept. No geolocation is performed.

**Plain counters:** separately, the server counts per day how many times the
page is loaded (`page_view`) and share links are created (`share_created`) or
opened (`share_viewed`). Each is a bare number per day; nothing about the
visitor is recorded with it.

**What is never collected:** your availability blocks or time zones as usage
data; your location or country; your stored IP address; your browser/device
details; cookies or cross-site trackers; anything that identifies you
personally.

**Where it goes:** a same-origin endpoint (`/collect`) on the server that hosts
the app. No third-party analytics provider; the Content-Security-Policy keeps
the page confined to its own origin.

**Retention:** raw events are deleted after 12 months
(`TELEMETRY_RETENTION_DAYS`, default 365); only the daily counts and
unique-visitor totals are kept after that.

## Self-hosted copies

Telemetry is off unless the operator sets `TELEMETRY=1`. With it off there is no
consent wall and no `/collect` endpoint, and nothing in the code reports to the
author's server under any setting.

## Hosting logs

The app writes no access log. Rate limiting holds client IP addresses in memory
for up to an hour to stop abuse of the share and telemetry endpoints; they are
never written to disk.

## Changes

Material changes to what is collected will bump the consent version, so you
will be asked again rather than silently opted in.
