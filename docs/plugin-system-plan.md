# Plugin System Plan (In-Repo, Easily Separable)

This plan defines the minimal path to an in-repo plugin system that can be extracted later. It covers backend and frontend changes, plus a PrinterDriver example.

## Goals
- Allow plugins to extend existing UI locations via explicit extension points.
- Allow multiple instances per plugin, each with a name and config.
- Allow enable/disable and role-based access per instance.
- Enforce device and print restrictions in both UI and backend.
- Keep plugin modules isolated so they can be moved out of the repo.

## Scope Decisions
- In-repo modules for now; redeploy is acceptable.
- Backend is source of truth for available plugins and instances.
- Frontend renders only instances returned by API.

## Extension Points (Initial Set)
- `page.status`: top-bar menu area
- `packets.actions`
- `locations.actions`
- `component.actions`
- `printqueue.actions`
- `documents.actions`

## Phase 1: Backend Model and Registry
1. Add a plugin registry (code-level) with `definition_key`, `name`, `version`, `capabilities`, and `config_schema`.
2. Add DB models:
   - `PluginInstance`: `definition_key`, `name`, `enabled`, `config`, `created_by`
   - `PluginInstanceRole`: instance-to-role mapping
3. Add API endpoints:
   - `GET /api/v1/plugins/instances/` (list available instances for the user)
   - `POST /api/v1/plugins/instances/` (create)
   - `PATCH /api/v1/plugins/instances/{id}/` (update config, name, enabled)
   - `POST /api/v1/plugins/instances/{id}/execute` (action execution)

## Phase 2: Frontend Registry and Loader
1. Create a frontend registry mapping `definition_key` to UI integration hooks.
2. Fetch plugin instances from the backend and expose them to extension points.
3. Render actions for each extension point with capability checks.
4. Provide a settings UI for enabling/disabling and configuring instances.

## Phase 3: Printing Restrictions and Configurable Actions
1. Add explicit print capabilities:
   - Supported document types (example: `label`, `invoice`, `datasheet`)
   - Supported formats (example: `single_label`, `a4_sheet`)
2. Ensure UI filters printers based on supported types.
3. Ensure backend rejects unsupported print requests.
4. Support action-level configuration (for example, label size, skip labels).

## Phase 4: Example Plugin (PrinterDriver)
- Adds a button in `packets.actions`.
- When triggered, logs to console a list of labels that would be printed.
- Uses instance config to declare supported types and formats.

## Notes on Separability
- Keep plugins under `nextintranet_backend/nextintranet_plugins/<key>/` and `nextintranet_frontend/packages/plugins/<key>/`.
- Avoid importing core modules directly from plugins; use API contracts only.
- Keep frontend integration limited to `definition_key` and capability outputs.
