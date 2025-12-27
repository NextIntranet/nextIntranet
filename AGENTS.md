# Repository Guidelines

## Project Structure & Module Organization
- `nextintranet_backend/` is the Django backend (apps like `nextintranet_invoicing/`, `nextintranet_warehouse/`, plus `manage.py`).
- `nextintranet_frontend/` is the current React frontend (Vite + pnpm workspace).
- The previous Angular frontend is kept outside the repo at `../nextintranet_frontend_old/`.
- `NextIntranet_browser/` is the Electron desktop shell (Vue + Electron Forge).
- `nginx_config/` and `docker-compose.yml` provide local infra; `.data/` is used for local volumes.
- The repo may include legacy or unused code; confirm a module is active before refactors or deletion.

## Build, Test, and Development Commands
- Backend (Django): `python manage.py runserver` from `nextintranet_backend/` to run API locally.
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
