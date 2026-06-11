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

Use `DocLink` when navigation to the full documentation page is appropriate:

```tsx
<DocLink page="guide/settings/mcp" hash="generate-token">
  MCP setup guide
</DocLink>
```

Use `DocHelpButton` for contextual help in a slide-over sheet (user stays on the current page):

```tsx
<DocHelpButton page="guide/settings/mcp" hash="generate-token" label="MCP setup help" />
```

| Goal | Component |
|------|-----------|
| Open full `/docs/...` page | `DocLink` |
| Contextual help without leaving the page | `DocHelpButton` |
| Link to a section | `hash` prop (must match heading IDs in `manifest.json`) |

Sheet links can be shared via URL search params: `?help=guide/settings/mcp&helpHash=generate-token`.

Set `VITE_PUBLIC_DOCS_URL` for external links (see `nextintranet_frontend/.env.example`).
