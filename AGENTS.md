# Repository Guidelines

## Project Structure & Module Organization
- `nextintranet_backend/` is the Django backend (apps like `nextintranet_invoicing/`, `nextintranet_warehouse/`, plus `manage.py`).
- `nextintranet_frontend/` is the current Angular frontend; `nextintranet_frontend_old/` is a legacy Angular app.
- `nextintranet_react/` is a Nuxt 3 client.
- `NextIntranet_browser/` is the Electron desktop shell (Vue + Electron Forge).
- `nginx_config/` and `docker-compose.yml` provide local infra; `.data/` is used for local volumes.
- The repo may include legacy or unused code; confirm a module is active before refactors or deletion.

## Build, Test, and Development Commands
- Backend (Django): `python manage.py runserver` from `nextintranet_backend/` to run API locally.
- Frontend (Angular): `npm run start` (alias for `ng serve`) from `nextintranet_frontend/` to run on `:4200`; `npm run build` to produce `dist/`.
- Nuxt app: `npm run dev` from `nextintranet_react/` for local dev; `npm run build` for production build.
- Electron app: `npm run start` from `NextIntranet_browser/` to launch Electron; `npm run make` for distributables.
- Full stack via Docker: `docker compose up --build` from repo root (uses `.env`).

## Coding Style & Naming Conventions
- Angular frontend follows `.editorconfig`: 2-space indentation, UTF-8, trailing whitespace trimmed, single quotes in `*.ts`.
- TypeScript/JS: follow existing file patterns; avoid reformatting unrelated code.
- Python (Django): follow module layout under `nextintranet_backend/` and keep app-level names consistent with existing apps.
- S3 naming: use lowercase, hyphenated bucket names with environment suffixes (e.g., `nextintranet-dev`), and object keys like `uploads/<module>/<yyyy>/<mm>/<uuid>.<ext>`.

## Testing Guidelines
- Angular: `npm test` (Karma + Jasmine).
- Django: `python manage.py test` when adding or changing backend behavior.
- Prefer co-located tests (e.g., `*.test.ts`, `tests.py`) and keep test names descriptive.

## Commit & Pull Request Guidelines
- Commit messages are short, sentence-style phrases (no strict prefixes). Example: `layout improvement, isMobile signal for responsibility`.
- PRs should describe the change, include reproduction steps, and add screenshots for UI changes.
- Link related issues or tasks if applicable.

## Security & Configuration Tips
- Keep secrets in `.env` (used by `docker-compose.yml`); do not commit credentials.
- Backend expects Postgres and Redis when running via Docker.
- Store uploaded data in S3-compatible storage; when using Docker locally, use MinIO as the S3 backend.
