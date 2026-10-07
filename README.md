# device-probe

Open the page on any device — a Samsung or LG TV browser, VIDAA, Android TV, Fire TV, a console, a phone, a PC —
and it shows everything the browser exposes about that device, then files the result in a shared device table.

Built for one question: **which client can we offer this device, and what can its browser actually do?**

## What it reads

| area | signals |
| --- | --- |
| identity | User-Agent, UA Client Hints (low + high entropy), HbbTV UA (vendor, model, firmware), `navigator.*` |
| platform | Tizen / webOS / VIDAA / Android TV / Fire TV / Cast / consoles / XR, TV model year from the engine version, injected vendor globals (`tizen`, `webapis`, `PalmSystem`, `Hisense_*`, ...) |
| server view | request headers as the server sees them, incl. `Sec-CH-*`, `X-Requested-With` (the wrapping app on Android) |
| display | screen, DPR, physical pixels, viewport, HDR / colour gamut and 30 other media queries |
| graphics | WebGL 1/2 (unmasked GPU), WebGPU adapter |
| video | `canPlayType` + MSE for H.264 / HEVC / VP9 / AV1 / Dolby Vision, MediaCapabilities (smooth / power-efficient = hardware) for 4K60 and WebRTC decoding, WebCodecs |
| audio | AAC, Opus, AC-3, E-AC-3, AC-4, DTS ..., channel count, speech voices |
| DRM | Widevine (L1/L3 by robustness), PlayReady (SL2000/SL3000), FairPlay, ClearKey |
| WebRTC | send / receive codecs |
| input | live remote-key tester (`keyCode` table for Tizen, webOS, HbbTV), live gamepads, Back-key trap |
| network | Network Information API, round trip to Frankfurt (function) and to the nearest CDN edge |
| other | storage, CPU threads, memory, a CPU micro-benchmark, 50+ web platform features, permissions, locale |

## Store deep links

The page offers store deep links for the detected platform and records what happened (page hidden,
focus lost, nothing, navigated away). Android TV (`market://`, `intent://`) and Fire TV (`amzn://`) have
documented schemes. Samsung and LG only allow opening their stores from installed apps
(`tizen.application.launchAppControl`, Luna service calls), so those candidates are experiments: the
outcome on a real TV is the useful data. For Samsung, pass the app id: `/?samsungAppId=<id>`.

## The device table

* `/` — probe this device; the report is saved automatically (no IP, no cookies).
* `/reports` — every stored device configuration: filter by class, search, export CSV.
* `/r/<id>` — one stored report. The QR code on the probe page opens it on a phone.
* `/?nosave` — probe without saving. `/?all` — show every deep link candidate.

One record per device configuration (User-Agent + screen + GPU + UA-CH). Visits are counted once per
page session; pressed keys, gamepads and deep link attempts accumulate across visits.

## API

| endpoint | |
| --- | --- |
| `GET /api/echo` | request headers, IP and coarse geo (IP and city are never stored) |
| `GET /api/ping` | `pong`, for round-trip timing |
| `POST /api/report` | `{ session, report, digest }`, stores or updates the device record |
| `GET /api/report?id=` | one stored record |
| `GET /api/reports` | all records, newest first |
| `GET /api/qr?id=` | SVG QR code of a report URL |

Records live in a private Vercel Blob store: `reports/<id>.json` plus `index.json` for the table.

```bash
vercel blob list
vercel blob get index.json
vercel blob del reports/<id>.json
```

(After deleting a record by hand, remove its row from `index.json` too.)

## Compatibility

The client is plain ES5 with no dependencies and uses `XMLHttpRequest` — it has to run on Chromium 38
(webOS 3) and older WebKit TV browsers. Every probe is isolated: a failing API is logged in the report's
`errors` and never stops the page.

## Run locally

```bash
npm install
vercel dev
```
