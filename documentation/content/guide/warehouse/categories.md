---
title: Categories
description: Hierarchical component categories, inherited color/icon, and parameter rules.
---

# Categories

Categories classify components into a tree, similar in shape to
[Locations](locations.md) but used for organization rather than physical placement.

## Hierarchy

- Each category has an optional `parent`, forming an unlimited-depth tree (MPTT).
- `name` is unique; `abbreviation` is a unique short code used where space is tight
  (e.g. generated labels).
- `full_path` joins the ancestor chain with `/`.

## Color and icon

A category can set its own `color` and `icon`. If left empty, `effective_color` /
`effective_icon` fall back to the nearest ancestor that has one set — so setting a
color on a top-level category (e.g. "Passive components") colors every subcategory
that doesn't override it.

## Parameter rules

A `CategoryParameterRule` links a category to a `ParameterType` with a
`value_template`, letting a category suggest or pre-fill parameters for the
components inside it (e.g. every component under "Resistors" gets a suggested
`Tolerance` parameter). Rules are inherited down the tree; the effective (resolved)
set of rules for a category can be fetched separately from the rules defined
directly on it.

## API

| Method & path | Purpose |
|---|---|
| `GET/POST /api/warehouse/category/` | List / create categories |
| `GET/PUT/PATCH/DELETE /api/warehouse/category/<id>/` | Single category |
| `GET /api/warehouse/category/tree/` | Full tree, all roots |
| `GET /api/warehouse/category/<id>/tree/` | Subtree rooted at one category |
| `GET /api/warehouse/category/rules-summary/` | `{category_id: [{name, template}, ...]}` for every category |
| `GET/POST /api/warehouse/category/<id>/rules/` | Parameter rules defined directly on a category |
| `GET /api/warehouse/category/<id>/rules/effective/` | Resolved rules, including inherited ones |

Also available over MCP as `list_categories` / `get_category` (read) and
`create_category` / `update_category` / `delete_category` (write) — see
[MCP integration](../settings/mcp.md).

## Related topics

- [Components](components.md) — each component belongs to at most one category
- [Locations](locations.md) — the equivalent hierarchy for physical placement
