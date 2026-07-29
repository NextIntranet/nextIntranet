---
title: Search
description: Global search, component catalog search, and identifier resolution.
---

# Search

NextIntranet has two independent search boxes with different goals:

| | Global search | Component catalog search |
| --- | --- | --- |
| Where | Search dialog opened from the sidebar, available anywhere in the app | Search field above the component list in **Warehouse** |
| API | `GET /api/v1/search/` | `GET /api/v1/store/components/?search=` |
| Scope | Components, locations, packets, purchases, productions | Components only |
| Result style | A few best matches per area for quick navigation | Full paginated component list, combinable with filters |

## Global search

Endpoint: `GET /api/v1/search/` (also accepts `POST` with the same parameters).

### Query parameters

- `q`: required search string or scanned code.
- `context`: optional context hint (`store`, `purchases`, `production`).
- `source`: optional filter (`components`, `locations`, `packets`, `purchases`, `productions`).
- `limit`: optional max results (1-25).

### Searched fields per source

All matches are case-insensitive substring matches (`icontains`), unless noted otherwise.

| Source | Fields |
| --- | --- |
| `components` | name, description, UUID, supplier part number, supplier name |
| `locations` | name, location path, description, UUID |
| `packets` | component name, location name, description, UUID |
| `purchases` | UUID, note, supplier name |
| `productions` | name, description, folder name, UUID |

Each source returns at most a few results (default limit 6), so the global
search is broad but shallow — it is meant for jumping to an object, not for
browsing.

### External identifiers (e.g. legacy IDs such as UST_ID)

Besides field matching, the global search resolves **external identifiers**
attached to objects (component or packet detail page, section
**External identifiers**; schemes: internal, EAN, SKU, supplier code, legacy,
other). The query is compared against every identifier value with an exact,
case-insensitive match and returns the linked object — no matter which source
it belongs to.

This is the only search that looks at external identifiers. An identifier such
as `UST_ID` stored on a component is therefore found by the global search,
but **not** by the component catalog search.

### Source filters

You can add a filter in the query string using the syntax:

- `source:store <value>`
- `source:packets <value>`
- `source:purchases <value>`
- `source:orders <value>`
- `source:productions <value>`

Aliases supported: `store`, `warehouse`, `component(s)`, `location(s)`, `packet(s)`, `purchase(s)`, `order(s)`, `production(s)`, `all`.

### Barcode payloads

If the scanned value includes a query string, the handler will resolve supported keys:

- `component=<uuid>`
- `packet=<uuid>`
- `location=<uuid>`
- `purchase=<uuid>` (alias: `order`)

### Defaults

- No context: search across all sources.
- `context=store`: search components only.
- `context=purchases`: search orders only.
- `context=production`: search productions only.

## Component catalog search

The search field on the **Warehouse** page is focused purely on browsing the
component catalog:

- matches components by **name, description, or UUID** (case-insensitive substring),
- can be combined with the **category** and **location** filters,
- returns the full paginated list of matching components.

It intentionally does **not** search external identifiers, supplier part
numbers, or other object types (packets, locations, orders, …). Use the global
search for those.

## Which search should I use?

- A scanned code, a legacy or custom identifier (e.g. `UST_ID`), a supplier
  part number, or any non-component object (packet, location, order,
  production) → **global search**.
- Browsing and filtering the component catalog by name or description →
  **component catalog search**.
