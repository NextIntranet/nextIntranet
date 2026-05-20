# NextIntranet HW Agent

Local/LAN service for HW access (serial scanner + label printer). It exposes
an HTTP API plus a WebSocket event stream. This folder is intentionally
separate from the Django backend and frontend.

## Run (dev)

```
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

## Configuration

Environment variables:
- `NEXT_AGENT_ID` (default: `agent-local`)
- `NEXT_AGENT_TOKEN` (optional; when set, requests must include the token)
- `NEXT_AGENT_ALLOWED_ORIGINS` (comma-separated origins for CORS; required for browser access)
- `NEXT_AGENT_STATION_ID` (optional; events will default to this station)
- `NEXT_AGENT_HOST` (default: `0.0.0.0`)
- `NEXT_AGENT_PORT` (default: `9101`)

Auth:
- HTTP: `X-Agent-Token: <token>` or `Authorization: Agent <token>`
- WebSocket: `?token=<token>` query param

## API (v1)

HTTP:
- `GET /v1/status`
- `GET /v1/serial/ports`
- `POST /v1/serial/open`
- `POST /v1/serial/write`
- `POST /v1/serial/close`
- `GET /v1/print/printers`
- `POST /v1/print/job`

WebSocket:
- `/ws/events/`
- `/ws/station/{station_id}/`

Events follow the same shape as the existing realtime WebSocket:
`{ id, type, stationId, deviceId, ts, payload }`.
