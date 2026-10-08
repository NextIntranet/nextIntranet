---
title: BOMs (production templates)
description: Manage BOM lines, link components, check stock availability, and lock/finalize a production run.
---

# BOMs (production templates)

**Production** (`/production`) is a manufacturing project — a product with a name,
description, and an optional link back to a warehouse component. Under a production
sit one or more **Templates**, called "BOMs" everywhere in the UI: versioned parts
lists that describe what a production run of boards actually needs.

## BOM lifecycle

A BOM (`Template`) moves through:

| Status | Meaning |
|---|---|
| `draft` | Being built or imported; freely editable. |
| `in_progress` | Actively used to source and place parts. |
| `locked` | Frozen — no more line edits, but reversible. |
| `finished` | Finalized; a summary of what was and wasn't fully placed has been captured. |

`locked` and `finished` are both **closed**: every edit, scan, split/merge, or
finalize action is rejected once a BOM is closed.

## BOM lines

Each BOM line (`TemplateComponent`) groups one or more physical designators (e.g.
`R1`, `R2`, `R3`) that share the same part — `refs` lists the designators, and
`qty_per_board` is how many of them exist on one board. A line can be:

- **linked** to a warehouse component, or
- **unlinked** — common right after importing a netlist, before someone has matched
  the imported `value` + `footprint` to a catalog component.

### Linking, splitting, and merging

- Assigning a component to **all** refs of a line links the whole line.
- Assigning a component to a **subset** of refs splits them off into a new line,
  leaving the rest on the original line.
- Assigning a component that's already linked to another line in the same BOM
  **merges** the refs (and their scan history) into that existing line instead of
  creating a duplicate.
- Unlinking a line clears its component, so a reserved BOM stops holding that
  component for the line. Its sourced/placed progress is not reset.

## Reserving a BOM

A BOM can be planned without holding any stock. **Reserve BOM** makes it hold, in its
warehouse, what each line still needs:

`remaining = needed_total − placed_total` (zero for `dnp` lines).

Nothing is copied when you reserve. The held quantity is recalculated from the BOM every
time, so it follows changes to `qty_planned`, added or unlinked lines, and placed parts.
A finished BOM holds nothing. **Unreserve BOM** releases the hold.

- The BOM's warehouse (`stock_warehouse`) is chosen in the picker next to the button.
  When it is not set, your home location's warehouse is used, or the only warehouse
  if there is just one. Changing it moves the hold to the new warehouse.
- Reserved BOMs carry a **Reserved** badge in the product's BOM list.
- Only working series can be reserved; closed BOMs cannot be reserved.

## Availability

Each line's availability is computed for the BOM's warehouse:

- `needed_total` — `qty_per_board × qty_planned` (or a manual `qty_override_total`
  when set). `remaining` is what is still to be placed.
- `here` — in the BOM's warehouse: `on_hand` (stocked packets), `reserved_by_others`
  (manual reservations, other BOMs, and other lines of this BOM) and `free`.
  The line's own hold is not counted against it.
- `in_stock` — what the line can use there (`free`, never below zero).
- `elsewhere` — other warehouses with free stock. This is shown for information
  only and never counted.
- `status` — `ok` when the warehouse covers `remaining`, `elsewhere` when other warehouses
  could cover the shortage, `missing` when no warehouse can, `unlinked` for lines
  without a component.
- `shortage` — true when `remaining` exceeds `in_stock`.

In the BOM table the **Warehouse** column shows `in_stock / remaining`, the BOM's
warehouse with what others reserve and what this BOM holds, free stock in other
warehouses, and the packets. Colours: green available, amber exact, orange only in
another warehouse, red missing.

The same computation can include `total_in_home`, stock scoped to the signed-in
user's home location subtree, useful for "do I personally have enough on my bench"
checks.

## Requesting missing parts

When a line is short in the BOM's warehouse, its Warehouse cell offers **Request N**: it files a
[purchase request](../warehouse/purchases.md#purchase-requests) for the missing quantity. You can
change the quantity and the target warehouse or position, which defaults to the BOM's
warehouse. **Request missing** in the toolbar does this for every short line at once.

- The quantity is the shortage in the BOM's warehouse minus what is already ordered for the line.
- Each line has one open request. Requesting again updates it ("Update request").
- The cell shows what is requested (and where it goes) and what is already ordered.
- Stock in other warehouses is not used up automatically. Transfer requests between warehouses
  are planned.

## Sourcing and placing

Scanning a barcode against a BOM line records a `TemplateComponentScan`, in one of
two modes:

- **sourced** — the parts have been pulled and are ready to place.
- **placed** — the parts have actually been soldered/assembled. Placing deducts
  stock immediately via a linked stock operation — stock is not deducted at lock or
  finalize time.

Scans can be undone (`undo-last-scan`) or removed individually.

## Lock and finalize

- **Lock** freezes the BOM (`status = locked`) without touching stock — use it to
  stop further edits while still deciding whether to proceed.
- **Finalize** (`status = finished`) computes a final per-line summary
  (`needed_total`, `placed_total`, `deducted_total`) and returns the list of lines
  that were never fully placed, so you can see at a glance what's still outstanding
  before closing out the run.

## Duplicating and re-importing

- **Duplicate** copies a BOM (useful for starting a new revision without losing the
  original).
- BOMs can be **imported** from an uploaded netlist/XML file or from a URL, and later
  **re-imported** to refresh from the original source — this is where the
  `series_kind` distinction between a `template` (the imported reference copy) and a
  `working` copy (the one actually used for production) comes in.

## API

Endpoints live under `/api/v1/production/` (`folders`, `productions`, `templates`,
`template-components`, `realizations`, `realization-components`), with actions such
as `templates/<id>/lock/`, `templates/<id>/finalize/`, `templates/<id>/availability/`,
`templates/<id>/scan/`, and `template-components/<id>/split/` /
`.../merge/` / `.../set-component/`.

The same read/write surface is available over MCP: `list_productions`,
`get_production`, `list_boms`, `get_bom`, `get_bom_availability` (read),
`update_bom`, `set_bom_line_component`, `unlink_bom_line_component`, `lock_bom`,
`finalize_bom` (write) — see [MCP integration](../settings/mcp.md).

## Related topics

- [Live iBOM viewer](ibom.md) — an interactive board view with live stock overlay
- [Reservations](../warehouse/reservations.md) — manual reservations and how stock holds are counted
- [Packet pricing](../warehouse/pricing.md) — how placed-scan stock deductions are valued
