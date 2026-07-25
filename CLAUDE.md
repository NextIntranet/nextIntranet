# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture overview

NextIntranet is a warehouse / intranet management system with three main runtime components:

| Component | Tech | Location |
|-----------|------|----------|
| Backend | Django 5 + DRF + django-q + Daphne (ASGI) | `nextintranet_backend/` |
| Frontend | React + Vite + pnpm workspace + shadcn/ui | `nextintranet_frontend/` |
| HW agent | FastAPI / aiohttp (printers, barcode scanners) | `nextintranet_agent/` |

Everything runs behind **nginx on port 9000**. The dev URL is `http://localhost:9000`.

**Routing (nginx)**:
- `/api/*` → Django `web` container (port 8000, gunicorn)
- `/ws/*` → Django `web_asgi` container (port 8001, Daphne/Channels)
- `/mcp` → Django `web` (SSE, buffering disabled)
- `/s3/*` → MinIO (S3-compatible object store)
- `/*` → Vite dev server (frontend container)

**Django apps**:
- `nextintranet_backend` — core: User model, auth, middleware, WebSocket consumers
- `nextintranet_warehouse` — components, packets, stock operations, locations, suppliers, inventory (stocktaking), reservations, purchases, labels, KiCad HTTP library, MCP server
- `nextintranet_invoicing` — invoicing module
- `nextintranet_production` — production BOM / assembly
- `nextintranet_plugins` — plugin registry and printer driver abstraction

**Frontend packages** (`nextintranet_frontend/packages/`):
- `app` — React SPA (all pages, components, hooks)
- `core` — shared: API client (`core/src/api/client.ts`), auth storage, WebSocket/realtime client, HW agent bridge

**Background tasks**: Django-Q (`worker` service, `python manage.py qcluster`). Requires a separate restart when task code changes — it does not hot-reload.

**Realtime**: Django Channels over Redis, consumed by `web_asgi`. Frontend connects via WebSocket at `/ws/`.

## Development commands

All backend and frontend commands must run inside Docker:

```bash
# Start full stack
docker compose up --build

# Run Django management commands
docker compose run --rm --entrypoint "" web python manage.py <command>

# Common management commands
docker compose run --rm --entrypoint "" web python manage.py makemigrations
docker compose run --rm --entrypoint "" web python manage.py migrate
docker compose run --rm --entrypoint "" web python manage.py test

# Frontend type check
docker compose run --rm frontend pnpm --filter @nextintranet/app typecheck
# or from host if pnpm is installed:
cd nextintranet_frontend && pnpm --filter @nextintranet/app typecheck

# Frontend build
docker compose run --rm frontend pnpm --filter @nextintranet/app build
```

**After changing background task code**, restart the worker:
```bash
docker compose restart worker
```

## Adding frontend dependencies

Always run from the `nextintranet_frontend/` workspace root:

```bash
pnpm add <pkg> -C packages/app    # app-specific
pnpm add <pkg> -C packages/core   # shared core
pnpm install --no-frozen-lockfile  # regenerate lockfile
```

Commit `package.json` and `pnpm-lock.yaml` together, otherwise Docker build fails with `ERR_PNPM_OUTDATED_LOCKFILE`.

## Code conventions

**UI language**: All labels, buttons, descriptions, tooltips must be in **English**.

**Frontend**:
- Use shadcn/ui, Radix, and TanStack Query before writing custom CSS or state.
- Shared UI components live in `packages/ui`; shared logic/hooks in `packages/core`.
- Notifications via `sonner` (success and error).
- Use `LocationParentSelect` (`packages/app/src/components/LocationParentSelect.tsx`) for hierarchical location picking.
- URL paths use singular nouns (`/store/category`, not `/store/categories`).

**Backend**:
- Follow the existing app module layout. New warehouse features go in `nextintranet_warehouse`.
- API endpoints are class-based views (DRF) or DRF routers; see `nextintranet_warehouse/urls_api.py` for patterns.
- Auth: JWT via `rest_framework_simplejwt`. The `/api/v1/me/` endpoint returns `access_permissions`; keep this field in `UserSerializer`.
- S3 object keys: `uploads/<module>/<yyyy>/<mm>/<uuid>.<ext>`. Bucket names: lowercase, hyphenated, with environment suffix.

**Commit style**: Short, sentence-style phrases, no prefixes. Example: `layout improvement, isMobile signal for responsibility`.

## Documentation

- Source: `documentation/content/**/*.md` (frontmatter: `title`, `description`, optional `draft: true`).
- After adding or renaming pages: update `documentation/mkdocs.yml` nav **and** run `pnpm docs:manifest` from `nextintranet_frontend/`.
- Internal design docs/plans: `docs/` (not published).
- Use `DocLink` for deep links to docs pages; `DocHelpButton` for contextual help sheets.

## MCP server

- Exposed at `/mcp`, implemented in `nextintranet_warehouse/mcp_tools.py` (warehouse/inventory) and `nextintranet_production/mcp_tools.py` (production BOMs). Each app registers its toolsets via `apps.py` `ready()` → `mcp.py`.
- Auth: `X-Service-Token` header, scopes `mcp:read` / `mcp:write`.
- After deploying MCP changes, restart **all** `web` replicas together — mixed versions cause intermittent `Unknown tool` errors.

## Plugin system

- Plugins are isolated under dedicated modules; no cross-imports between core app and plugin internals.
- Registered by `definition_key`; expose only stable API contracts.
- Extension points: `page.status`, `packets.actions`, `locations.actions`, `component.actions`, `printqueue.actions`, `documents.actions`.
- Printing plugins must declare supported document/label types and enforce restrictions in both UI and backend.
- Plugin actions with runtime config: drive the config form from a schema to keep the UI generic.

## KiCad HTTP Library

Provides KiCad symbol library integration from the warehouse. Config file served at `/api/kicad/nextIntranet.kicad_httplib`. The `root_url` is derived from `SITE_URL` in settings/`.env`.
