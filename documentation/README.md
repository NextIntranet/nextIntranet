# NextIntranet documentation

User-facing and product documentation lives in `content/` as Markdown. The same sources power:

- **Public site** — [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) built to `site/` and deployed to GitHub Pages (workflow `.github/workflows/docs.yml`)
- **Intranet UI** — React app routes under `/docs/*` (see `nextintranet_frontend/packages/app/src/pages/DocsPage.tsx`)

## Edit content

Add or change files under `content/`. Use YAML frontmatter for `title`, `description`, and optional `draft: true` (draft pages are hidden from the intranet manifest).

Register new pages in `mkdocs.yml` `nav` when they should appear on the public site.

## Regenerate manifest

The intranet sidebar and table of contents use `manifest.json`:

```bash
cd documentation
npm install
npm run build:manifest
```

Or from the frontend workspace root: `pnpm docs:manifest`

Commit `manifest.json` when headings or page list changes.

## Local public preview

```bash
pip install mkdocs-material
mkdocs serve -f documentation/mkdocs.yml
```

## Deep links from UI

Use `DocLink` in the React app:

```tsx
<DocLink page="guide/settings/mcp" hash="generate-token">
  MCP setup guide
</DocLink>
```

Set `VITE_PUBLIC_DOCS_URL` for external links (see `nextintranet_frontend/.env.example`).
