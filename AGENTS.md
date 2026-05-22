# Repository Guidelines

## Project Structure & Module Organization
- `nextintranet_backend/` is the Django backend (apps like `nextintranet_invoicing/`, `nextintranet_warehouse/`, plus `manage.py`).
- `nextintranet_frontend/` is the current React frontend (Vite + pnpm workspace).
- The previous Angular frontend is kept outside the repo at `../nextintranet_frontend_old/`.
- `NextIntranet_browser/` is the Electron desktop shell (Vue + Electron Forge).
- `nginx_config/` and `docker-compose.yml` provide local infra; `.data/` is used for local volumes.
- The repo may include legacy or unused code; confirm a module is active before refactors or deletion.

## Build, Test, and Development Commands
- **Run backend and frontend commands inside Docker Compose** when the stack is containerized: use `docker compose run <service> <command>` from repo root (e.g. `docker compose run web python manage.py makemigrations`, `docker compose run web python manage.py migrate`, `docker compose run frontend_react_v2 pnpm build`). This keeps the same environment as production and avoids “works on my machine” issues.
- Backend (Django): `python manage.py runserver` from `nextintranet_backend/` to run API locally; or via Docker: `docker compose up web` and run management commands with `docker compose run --rm --entrypoint "" web python manage.py <command>` (empty `--entrypoint` overrides the image’s default `runserver` so the given command runs instead).
- Frontend (React, `nextintranet_frontend/`, pnpm): `pnpm dev` for Vite dev server; `pnpm build` for production; `pnpm preview` to serve a build locally.
- Legacy Angular (reference only): `npm run start` (alias for `ng serve`) from `../nextintranet_frontend_old/` to run on `:4200`; `npm run build` to produce `dist/`.
- Electron app: `npm run start` from `NextIntranet_browser/` to launch Electron; `npm run make` for distributables.
- Full stack via Docker: `docker compose up --build` from repo root (uses `.env`).

## Adding or Updating Frontend Dependencies (`nextintranet_frontend`)
- Always update dependencies from the workspace root `nextintranet_frontend/` so that `pnpm-lock.yaml` stays in sync.
  - For app package deps: `pnpm add <pkg> -C packages/app`
  - For core/ui/etc.: `pnpm add <pkg> -C packages/<workspace>`
- After adding or updating a dependency, **always regenerate the lockfile**:
  - `pnpm install --no-frozen-lockfile`
- Before running Docker, make sure `pnpm-lock.yaml` is committed together with the `package.json` changes. This avoids `ERR_PNPM_OUTDATED_LOCKFILE` during `pnpm install --frozen-lockfile` in the image build.
- If you hit `ERR_PNPM_OUTDATED_LOCKFILE` in CI or Docker:
  - On host: run `pnpm install --no-frozen-lockfile` in `nextintranet_frontend/`.
  - Rebuild the image without cache for the frontend:
    - `docker compose build --no-cache frontend_react_v2`
    - `docker compose up -d frontend_react_v2`

## User Access & Permissions
- The system uses a user access control system for managing permissions.
- User roles and permissions are managed through Django's authentication system in the backend.
- Access control should be implemented at both the API level (Django) and enforced in the frontend clients.
- `/api/v1/me/` now returns `access_permissions` via `UserSerializer`. Keep the field in the serializer and ensure auth token refresh preserves it.

## Coding Style & Naming Conventions
- React frontend: prefer framework-provided styles and components (shadcn/ui, TanStack Query, Radix) before introducing custom CSS; reuse shared UI in `nextintranet_frontend/packages/ui`.
- React frontend: use the shared `LocationParentSelect` component (`nextintranet_frontend/packages/app/src/components/LocationParentSelect.tsx`) for hierarchical parent selection with search.
- URL paths should use singular nouns (e.g., `/user`, `/store/category`).
- Favor long-term maintainability when choosing approaches; avoid short-term hacks that increase future upkeep.
- Notifications: use `sonner` for success/error confirmations on API requests and clipboard actions; include a short, user-facing problem statement on failures.
- Links: provide copy-link actions for external URLs wherever practical.
- TypeScript/JS: follow existing file patterns; avoid reformatting unrelated code.
- Python (Django): follow module layout under `nextintranet_backend/` and keep app-level names consistent with existing apps.
- S3 naming: use lowercase, hyphenated bucket names with environment suffixes (e.g., `nextintranet-dev`), and object keys like `uploads/<module>/<yyyy>/<mm>/<uuid>.<ext>`.
- **UI Language**: All web interface elements (labels, buttons, descriptions, tooltips, etc.) must be in English.

## Testing Guidelines
- Testing is not a priority at this stage; focus on feature development.
- When tests are needed: React app uses `pnpm typecheck` today; Django uses `python manage.py test`.
- Keep test names descriptive when they are written.

## Commit & Pull Request Guidelines
- Commit messages are short, sentence-style phrases (no strict prefixes). Example: `layout improvement, isMobile signal for responsibility`.
- PRs should describe the change, include reproduction steps, and add screenshots for UI changes.
- Link related issues or tasks if applicable.

## Security & Configuration Tips
- Keep secrets in `.env` (used by `docker-compose.yml`); do not commit credentials.
- Backend expects Postgres and Redis when running via Docker.
- Store uploaded data in S3-compatible storage; when using Docker locally, use MinIO as the S3 backend.

## Plugin System (In-Repo, Separatable Later)
- Keep plugins isolated under dedicated modules; avoid cross-imports between core app and plugin internals.
- Register plugins by `definition_key` and expose only stable API contracts; do not depend on internal module paths.
- Support multiple instances per plugin with a user-facing name, `enabled` flag, and per-instance config.
- Enforce access via role mappings; superadmin bypasses role checks.
- Extension points in scope: `page.status`, `packets.actions`, `locations.actions`, `component.actions`, `printqueue.actions`, `documents.actions`.
- Printing plugins must declare supported document/label types and enforce restrictions both in UI and backend.
- Plugin actions may require runtime configuration; drive these forms from a schema to keep UI generic.

## MCP Server (Model Context Protocol)

NextIntranet exposes a warehouse MCP server at `/mcp` so AI agents (Claude Code, Claude Desktop, Cursor, etc.) can query and modify warehouse data.

### Setup

1. Go to **Settings > Software** in the web UI (`/settings/software`).
2. In the **Generate MCP config** card, enter a token name, optionally customize the **MCP server name** (default `nextintranet-warehouse`, the `mcpServers` key in JSON), choose **Read-only** or **Read & Write** access, and click **Generate config**.
3. Copy the generated JSON and paste it into your MCP client configuration:
   - **Claude Code**: `~/.claude/claude_code_config.json` under `"mcpServers"`
   - **Claude Desktop**: `~/.claude/claude_desktop_config.json` under `"mcpServers"`
   - **Cursor**: Settings > MCP Servers

The generated JSON looks like:
```json
{
  "mcpServers": {
    "nextintranet-warehouse": {
      "url": "https://your-instance/mcp",
      "headers": {
        "X-Service-Token": "<generated-token>"
      }
    }
  }
}
```

### Available tools

**Read-only** (`mcp:read` scope):
- `search_components` — search by name, description, category, tag, location
- `get_component_detail` — full component detail with parameters, documents, packets, suppliers
- `get_inventory_summary` — stock overview (`limit` default 200, max 500)
- `list_categories` — categories (`include_nested` default true, `limit` default 500, max 2000)
- `get_category` — single category (`include_nested` default true: subcategory tree)
- `list_locations` — locations (`include_nested` default true, `limit` default 500, max 2000)
- `get_location` — single location (`include_nested` default true; by id or legacy uuid)
- `list_parameter_types` — parameter types (`limit` default 500, max 2000)
- `list_suppliers` — supplier list
- `get_supplier` — single supplier
- `list_component_suppliers` — supplier links for a component (`limit` default 50, max 200)
- `list_reservations` — reservation list (filter by component or search)
- `get_reservation` — single reservation
- `get_packet` — single packet (stock batch)
- `list_component_packets` — packets for a component (`limit` default 100, max 500)

**Write** (`mcp:write` scope, includes all read tools):
- `update_component_description` — update a component's description (alias for description-only updates)
- `update_component` — update name, description, category, tags, selling/internal prices
- `set_component_parameters` — set/update component parameters
- `create_component` — create a new component (do not put URLs in description; use documents instead)
- `create_component_document` — attach a URL document to a component (e.g. product_page, datasheet)
- `create_packet` / `update_packet` / `add_packet_stock_operation` — packets and stock quantity changes
- `create_parameter_type` / `update_parameter_type` / `delete_parameter_type` — parameter types
- `create_category` / `update_category` / `delete_category` — categories
- `create_location` / `update_location` / `delete_location` — warehouse locations
- `create_supplier` / `update_supplier` / `delete_supplier` — suppliers
- `link_component_supplier` / `update_supplier_relation` / `delete_supplier_relation` — component–supplier links
- `create_reservation` / `update_reservation` / `delete_reservation` — reservations

### Architecture
- Backend: `django-mcp-server` library, toolsets in `nextintranet_warehouse/mcp_tools.py`
- Auth: ServiceToken with `mcp:read` / `mcp:write` scopes via `X-Service-Token` header
- Nginx proxies `/mcp` to the Django container with SSE buffering disabled
