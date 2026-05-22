# Internal developer notes

Published user and product documentation has moved to [`documentation/content/`](../documentation/content/).

Browse it in the intranet under **Documentation** (`/docs`) or on GitHub Pages after deploy.

This folder keeps internal plans and specs that are not part of the public nav:

- `hw-access-plan.md` — hardware integration specification
- `plugin-system-plan.md` — plugin system implementation plan
- `supplier-api-mapping.md` — supplier API mapping notes

To publish a page, move it into `documentation/content/`, add it to `documentation/mkdocs.yml`, and run `npm run build:manifest` in `documentation/`.
