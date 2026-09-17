---
title: Hardware
description: Connect barcode scanners and printers via the local HW agent or the browser's Web Serial API.
---

# Hardware

**Settings → Hardware** (`/setting/hardware`) configures how this browser talks to
physical devices — barcode scanners and printers — either through a small local
service (the **HW agent**) or directly via the browser.

Device profiles are stored in the browser's `localStorage`, so they're per-browser,
not per-user-account.

## HW agent

The HW agent (`nextintranet_agent/`) is a small aiohttp service you run on the same
machine or LAN as your scanner/printer hardware. It bridges:

- **Serial devices** (barcode scanners) — reads lines from a serial port and, in
  scanner mode, emits each decoded line as a `scanner.data` event.
- **Printers** — via CUPS, either printing a fetched file (e.g. a rendered label
  PDF) or sending a raw payload (such as ZPL) directly to the printer.

Add an agent under **Agents** with:

- **Label** — a friendly name.
- **Base URL** — where the agent is reachable, e.g. `http://localhost:9101`.
- **Token** — sent as `X-Agent-Token` on every request to the agent.
- **Capabilities** — optional comma-separated filter (`serial`, `scanner`, `print`);
  leave empty to allow all.
- **Agent config** — optional JSON of defaults (e.g. default printer or serial
  options) passed through to the agent.

The browser talks to the agent directly over HTTP for one-off calls (`/v1/status`,
`/v1/serial/*`, `/v1/print/*`) and keeps a WebSocket open to the agent for realtime
events. **Refresh status** checks every configured agent's `/v1/status` and shows
Online/Unknown per agent. The **Enabled/Disabled** toggle disconnects all agents at
once without deleting their configuration.

## Station ID

The **Station** field sets a `stationId` used to scope realtime events to "this
physical station" — for example, the [live iBOM viewer](../production/ibom.md) uses
it to target WebSocket events at the scanning station currently working on a board.

## Browser scanners (Web Serial)

On Chrome/Chromium over HTTPS or `localhost`, a USB serial barcode scanner can be
connected directly from the browser via the **Web Serial API**, with no agent
required:

1. Click **Add scanner**, then **Select port** — the browser prompts for permission
   to access a specific serial device.
2. Set the baudrate (default `115200`) and save — the scanner connects immediately.

Connected/disconnected status is shown per device, with **Connect** / **Disconnect**
/ **Remove** actions. This path is not available in browsers without Web Serial
support (e.g. Firefox, Safari).

## Related topics

- [Print queues](../printing/print-queues.md) — queueing and rendering the labels a
  printer ultimately prints
- [Put-away check](../warehouse/put-away.md) — a page that consumes scanner input
  from either an agent or a browser-connected scanner
