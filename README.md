# NextIntranet

Warehouse management, production BOMs, label printing, and hardware integration — all in one self-hosted intranet platform.

## What it does

- **Warehouse** — Components, stock packets, hierarchical locations, suppliers, reservations, and inventory campaigns
- **Production** — Products, BOMs, and manufacturing notes
- **Print** — Label queues and async render jobs with CUPS-based printer drivers
- **KiCad** — HTTP library integration: pull symbols and footprints straight from your warehouse into KiCad
- **MCP server** — Expose warehouse data to AI agents (Cursor, Claude, etc.) with scoped read/write access
- **Hardware agent** — Local service bridging label printers and barcode scanners over HTTP/WebSocket
- **Plugin system** — In-repo extension points for custom workflows, print drivers, and actions
- **Granular access** — Role-based permissions plus service tokens for machine-to-machine auth

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Frontend   │    │   Backend    │    │  HW Agent    │
│ React + Vite │    │  Django 6    │    │  FastAPI     │
│  shadcn/ui   │◄──►│  DRF + ASGI  │    │  (printers,  │
│ pnpm ws      │    │  Channels    │    │   scanners)  │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       │       ┌───────────┴───────────┐       │
       └───────┤    nginx :9000        ├───────┘
               └───────────┬───────────┘
                           │
                   ┌───────┴───────┐
                   │  Postgres 18  │
                   │  Redis        │
                   │  MinIO (S3)   │
                   └───────────────┘
```

| Component | Stack | Location |
|-----------|-------|----------|
| Backend API | Django 6, DRF, Django-Q, Daphne | `nextintranet_backend/` |
| Frontend | React 19, Vite, shadcn/ui, TanStack Query | `nextintranet_frontend/packages/app` |
| Core library | API client, auth, WebSocket, HW bridge | `nextintranet_frontend/packages/core` |
| HW Agent | FastAPI, aiohttp, pycups | `nextintranet_agent/` |
| Docs | MkDocs Material → GitHub Pages | `documentation/` |

## Quick start

```bash
# 1. Clone and set up environment
cp .env.example .env    # edit with your secrets

# 2. Start everything
docker compose up --build

# 3. Open http://localhost:9000
```

The stack includes Postgres 18, Redis, MinIO (S3-compatible storage), and nginx.
All services run inside Docker except the [HW Agent](#hw-agent), which runs locally on the machine with physical printers/scanners.

Build production images with version metadata:

```bash
make build-prod    # sets GIT_COMMIT, GIT_BRANCH, BUILD_DATE
```

## Django management

Management commands run through the `web` container:

```bash
docker compose run --rm --entrypoint "" web python manage.py <command>
# Examples:
docker compose run --rm --entrypoint "" web python manage.py migrate
docker compose run --rm --entrypoint "" web python manage.py test
docker compose run --rm --entrypoint "" web python manage.py shell
```

After changing background task code, restart the worker (it does **not** hot-reload):

```bash
docker compose restart worker
```

## Frontend development

The frontend is a pnpm workspace at `nextintranet_frontend/`:

```bash
cd nextintranet_frontend
pnpm dev                 # Vite dev server
pnpm --filter @nextintranet/app typecheck
pnpm --filter @nextintranet/app build
```

Package manager: `pnpm@9.15.0`. Add dependencies from the workspace root:

```bash
pnpm add <pkg> -C packages/app     # app-specific
pnpm add <pkg> -C packages/core    # shared core
pnpm install --no-frozen-lockfile  # regenerate lockfile
```

Commit `package.json` and `pnpm-lock.yaml` together.

## KiCad Integration

Use warehouse components directly in KiCad via HTTP library:

1. Download the config from `http://<your-server>/api/kicad/nextIntranet.kicad_httplib`
2. In KiCad → **Preferences → Manage Symbol Libraries** → add **HTTP Library**
3. Point to the downloaded file

Set `SITE_URL` in `.env` to control the public URL the config file advertises.

## HW Agent

The hardware agent connects physical printers and barcode scanners to NextIntranet. It runs **outside Docker** on the machine with the hardware.

```bash
cd nextintranet_agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

NEXT_AGENT_ALLOWED_ORIGINS="http://localhost:9000" \
NEXT_AGENT_TOKEN="your-secret-token" \
python3 app.py
```

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_AGENT_TOKEN` | *(required)* | Auth token for secure access |
| `NEXT_AGENT_ALLOWED_ORIGINS` | *(required)* | CORS origins (comma-separated) |
| `NEXT_AGENT_HOST` | `0.0.0.0` | Bind address |
| `NEXT_AGENT_PORT` | `9101` | Listen port |
| `NEXT_AGENT_STATION_ID` | *(none)* | Default station identifier |

Then add the agent in NextIntranet UI → **Hardware** → **Add agent** with the base URL and token.

## MCP Server

The MCP server is exposed at `/mcp` and lets AI agents search and update warehouse data. Auth is via service token with `X-Service-Token` header and `mcp:read` / `mcp:write` scopes.

See [MCP integration](documentation/content/guide/settings/mcp.md) for setup instructions.

## Documentation

- **Source**: `documentation/content/**/*.md`
- **In-app**: authenticated at `/docs/…`
- **Public**: MkDocs Material → GitHub Pages — see `documentation/mkdocs.yml`
- After editing docs, regenerate the intranet index: `cd nextintranet_frontend && pnpm docs:manifest`

## Further reading

- [Product overview](documentation/content/product/overview.md) — capabilities and audience
- [Getting started](documentation/content/guide/getting-started.md) — first steps inside the app
- [Plugin system](documentation/content/developer/plugin-system.md) — how to extend NextIntranet
- `CLAUDE.md` and `AGENTS.md` — detailed development conventions and stack notes
