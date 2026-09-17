---
title: Components
description: Manage warehouse components, parameters, and stock.
---

# Components

Components are the central catalog entries in the warehouse. Each component
can have a category, tags, parameters, linked documents, supplier relations,
and stock packets.

## Open a component

From **Warehouse**, search or browse the component list and open a detail page.
The URL pattern is `/store/component/<id>`.

## Fields

- `name`, `description` — the description accepts Markdown and is rendered as such
  on the component detail page. Prefer structured [documents](#documents) for URLs
  and datasheets rather than pasting links into the description.
- `category` — a single category from the [category tree](categories.md).
- `tags` — free-form, many-to-many, independent of category.
- `unit_type` — whether stock is tracked as whole pieces or a continuous quantity
  (e.g. meters of wire/cable).
- `selling_price` / `internal_price` — `internal_price` is the fallback used for
  packet valuation when no purchase price history exists; see
  [Packet pricing](pricing.md).
- `primary_image` — URL of the thumbnail shown in lists and detail pages.

## Parameters

Parameters are typed key/value attributes (e.g. `Resistance = 10k`,
`Tolerance = 1%`). Each `ParameterType` defines a value type, optional unit, and
optional validation (min/max, regex, or an allowed-values list). A parameter can be
`is_inherited` from a [category parameter rule](categories.md#parameter-rules)
rather than set directly on the component.

## Documents

Documents attach files or links to a component: datasheets, manuals, product pages,
and images. Each has a `doc_type`, a `name`, and either an uploaded `file` or an
external `url`. Exactly one image document can be `is_primary` — it becomes the
component's thumbnail. See [MCP integration → Component documents](../settings/mcp.md#component-documents)
for the rules around image URLs when creating documents programmatically.

## KiCad symbol

A component becomes pickable from KiCad once it has a parameter whose name starts
with `kicad:` — most importantly `kicad:symbol`, which is used as the symbol's
`symbolIdStr`. See the [KiCad HTTP library](../settings/kicad.md).

## Related topics

- [Categories](categories.md) — classification and inherited parameter rules
- [Packets & stock operations](packets.md) — physical stock for this component
- [Suppliers](suppliers.md) — supplier order codes and API-sourced data
- [Reservations](reservations.md) — hold stock for projects or orders
- [Search](../search.md) — global search across objects (incl. external
  identifiers) vs. the component catalog search above the list
