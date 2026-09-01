# Repository Guidelines

Source-of-truth companion: `CLAUDE.md` covers the same stack in more detail.

## What is active

- `nextintranet_backend/` — Django 6 API. Entry: `manage.py`. Apps: `nextintranet_backend` (users, auth, service tokens), `nextintranet_warehouse` (components, stock, labels, KiCad, MCP), `nextintranet_invoicing`, `nextintranet_production`.
- `nextintranet_frontend/` — React + Vite + pnpm workspace. Real packages: `packages/app` (SPA) and `packages/core` (API client, auth, realtime, HW bridge).
- `nextintranet_agent/` — local hardware agent (printer/scanner), runs **outside** Docker. Entry: `app.py`.
- `NextIntranet_browser/` — Electron/Vue desktop shell; less active.
- `nia/`, `nextIntranet_tools/`, root `package.json`/`node_modules` are legacy or side experiments. Confirm a module is active before editing.

## Local development (Docker Compose)

- Full stack: `docker compose up --build` → `http://localhost:9000`.
- Build images with version metadata: `make build` or `make build-prod` (sets `GIT_COMMIT`, `GIT_BRANCH`, `BUILD_DATE`, `BUILD_METHOD` so `/api/v1/version/` works).
- Django management commands must override the `web` entrypoint:
  - `docker compose run --rm --entrypoint "" web python manage.py <command>`
  - Common: `makemigrations`, `migrate`, `test`, `shell`
- `web_asgi` container serves WebSockets at `/ws/`; `worker` runs Django-Q and does **not** hot-reload — restart it after task changes: `docker compose restart worker`.
- Frontend:
  - Dev: `cd nextintranet_frontend && pnpm dev` (or `docker compose run --rm frontend pnpm dev`)
  - Typecheck: `pnpm typecheck` (root script recurses through packages that define it)
  - Build: `pnpm build`
- Root `package.json` and root `node_modules` are **not** the React workspace; do not run `yarn`/`npm` there for frontend work.

## Frontend workspace quirks

- Package manager: `pnpm@9.15.0`. Workspace root: `nextintranet_frontend/`.
- Add dependencies from the workspace root:
  - `pnpm add <pkg> -C packages/app`
  - `pnpm add <pkg> -C packages/core`
  - Then `pnpm install --no-frozen-lockfile` to regenerate `pnpm-lock.yaml`.
- Commit `package.json` and `pnpm-lock.yaml` together. If Docker hits `ERR_PNPM_OUTDATED_LOCKFILE`, run `pnpm install --no-frozen-lockfile` on the host and rebuild: `docker compose build --no-cache frontend`.
- `tsconfig.json` still aliases `@nextintranet/ui` and `@nextintranet/warehouse`, but those packages do not exist yet; don't create them unless asked.
- `packages/core` exports: `.`, `./api`, `./realtime`, `./auth`, `./hw`. Import aliases in `packages/app`: `@/` → `src/`, `@nextintranet/core` → `packages/core/src`.

## Backend conventions

- Settings auto-load `.env` from the repo root (`nextintranet_backend/settings.py`). Keep real secrets in a local `.env` (gitignored).
- Auth: JWT (`rest_framework_simplejwt`) + service tokens (`ServiceTokenAuthentication`). `/api/v1/me/` returns `access_permissions` via `UserSerializer`; keep it and preserve it on token refresh.
- S3/MinIO is the default storage when `S3_ENDPOINT_URL` and `S3_STORAGE_BUCKET_NAME` are set. Bucket names: lowercase, hyphenated, env suffix (e.g. `nextintranet-dev`).
- `nextintranet_plugins/` is imported as a plain Python package (not a Django app); it holds the plugin registry and driver definitions.
- iBOM bridge: uploaded iBOM HTML gets `nextintranet_production/ibom_bridge_js/ni_bridge.js` injected at upload (`ibom_bridge.py`). That file is the single source — `assets/kibot/ibom_user.js` is a symlink to it, edit only the source. Stored files keep their injected copy until `python manage.py reinject_ibom_bridge`. Contract & console debugging: `docs/ibom-external-grouping.md`; offline test page: `ibom_bridge_js/harness.html` (open with `?template_id=harness`).

## Code & UI conventions

- All UI text must be in English.
- Frontend: prefer shadcn/ui, Radix, TanStack Query; avoid custom CSS. Shared code goes in `packages/core`. Reuse `LocationParentSelect` (`packages/app/src/components/LocationParentSelect.tsx`). Use `sonner` for notifications. Provide copy-link actions for external URLs.
- URL paths use singular nouns (e.g. `/store/component`, `/store/location`).
- S3 object keys: prefer `uploads/<module>/<yyyy>/<mm>/<uuid>.<ext>` for new uploads; existing modules vary, so follow the model you are touching.

## Documentation

- Source: `documentation/content/**/*.md` with frontmatter (`title`, `description`, optional `draft: true`).
- Intranet renders authenticated `/docs/*`. Use `DocLink` for deep links and `DocHelpButton` for contextual help sheets.
- Public site: MkDocs Material → GitHub Pages (`documentation/mkdocs.yml`, `.github/workflows/docs.yml`).
- After adding/renaming pages, update `documentation/mkdocs.yml` nav and run `pnpm docs:manifest` from `nextintranet_frontend/` (writes `documentation/manifest.json`).

## Plugins

- Keep plugins isolated; avoid cross-imports between core and plugin internals.
- Register by `definition_key`; expose only stable API contracts.
- Extension points: `page.status`, `packets.actions`, `locations.actions`, `component.actions`, `printqueue.actions`, `documents.actions`.
- Enforce role mappings in UI and backend; superuser bypasses.
- Printing plugins must declare supported document/label types and enforce them in UI + backend.

## MCP server

- Exposed at `/mcp` via `django-mcp-server`; tools live in `nextintranet_warehouse/mcp_tools.py`.
- Auth: `X-Service-Token` header (alias: `X-Application-Key`), scopes `mcp:read` / `mcp:write`.
- After MCP changes, restart **all** `web` replicas together. Mixed versions behind a load balancer cause intermittent `Unknown tool` errors.

## Hardware agent & KiCad

- Hardware agent runs locally, not in Docker. See `nextintranet_agent/README.md` and root `README.md` for env vars (`NEXT_AGENT_TOKEN`, `NEXT_AGENT_ALLOWED_ORIGINS`, etc.).
- KiCad HTTP library config is served at `/api/kicad/nextIntranet.kicad_httplib`; `root_url` comes from `SITE_URL` (`.env` / settings).

## Testing & CI

- Testing is not a current priority. When needed: Django `python manage.py test` (inside container), React `pnpm typecheck` (no unit test suite yet).
- `.github/workflows/build.yml` builds/pushes backend and frontend images to GHCR on `main` and version tags.
- `.github/workflows/docs.yml` deploys MkDocs to GitHub Pages when `documentation/**` changes.
