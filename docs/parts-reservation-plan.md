# Parts reservation plan

How components get reserved for production and manual use, per warehouse, and how the BOM
shows what is available here, what is only in another warehouse, and what is missing.

## Current state (problems this plan fixes)

- Production reservations are `Reservation` rows created by the frontend "Reserve BOM" button
  (one POST per line, not transactional). They are a snapshot of the BOM and drift from it:
  - placing a part deducts stock but does not shrink the reservation → other BOMs see the
    placed quantity subtracted twice;
  - finalizing a BOM does not release its reservations, and "Unreserve BOM" is disabled on
    closed BOMs → finished productions block stock forever;
  - changing `qty_planned` or adding lines after reserving is not reflected.
- Reservations have no location, so "available" is global across all warehouses.
- `expiration_date` is ignored everywhere except the dashboard counter.
- Availability is computed in four places with different rules (`Component.count`,
  `ComponentSerializer.get_inventory_summary`, the list annotation, `bom_availability_rows`).
  Some count `expected`/`retired` packets as stock, the BOM view skips packets with count ≤ 0.
- "Used in manufacturing" on the component page does not show reserved quantities.

## Decisions

| Topic | Decision |
|---|---|
| Physical stock vs. commitments | Stay separate. `StockOperation` remains a packet-level ledger of facts; commitments are not written there. |
| Unified view | Computed, not stored: on hand / reserved / free (later: incoming) from existing tables via one service. No component-level ledger table. |
| Warehouse | A location with `is_warehouse = True`. A location belongs to its nearest ancestor-or-self with the flag; stock outside any warehouse is reported as unassigned. The migration flags all root nodes. |
| Scope | Strict. A reservation blocks stock only in its warehouse. Stock in another warehouse is shown as information ("available in Brno"), never counted. |
| Production demand | Computed from the BOM, not stored as rows: per line `max(0, needed_total − placed_total)` while the BOM is reserved and not finished. |
| Planned but not reserved BOM | Allowed. A BOM blocks nothing until someone reserves it. |
| Manual reservations | Stay in the `Reservation` table, gain a required warehouse, expiration is honoured. |
| Missing parts | "Request component" on a BOM line creates a request with a target warehouse/location. Transfer requests between warehouses come later. |

## Data model

### `Warehouse` (location)
- `is_warehouse` — boolean, "this location is a warehouse". Data migration sets it on root nodes.
- `Warehouse.warehouse` — nearest ancestor-or-self with the flag (or `None`).

### `Reservation` (manual and other non-production sources)
- `warehouse` — FK `Warehouse`, must have `is_warehouse`. When omitted, defaults to the warehouse of
  the user's home location, or the only warehouse if there is exactly one.
- `expiration_date` — exposed in the REST serializer; expired rows are ignored by availability.
- `Reservation.objects.active()` — `expiration_date IS NULL OR expiration_date >= now()`.
  All availability code uses it.
- `sources` stays for provenance; `type: "production"` is no longer written.

### `Template` (BOM)
- `stock_warehouse` — FK `Warehouse` (must have `is_warehouse`). When "Reserve BOM" is called without
  one, defaults to the warehouse of the user's home location, or the only warehouse if there is
  exactly one; editable while the BOM is open.
- `reserved_at`, `reserved_by` — set by "Reserve BOM", cleared by "Unreserve BOM".
- A BOM blocks stock when `reserved_at IS NOT NULL AND status != 'finished'`. Finalizing therefore
  releases it automatically; `reserved_at` is kept as history.

### `PurchaseRequest`
- `target_location` — FK `Warehouse` (any storable node). Defaults to the BOM's `stock_warehouse`.
- `template_component` — nullable FK to the BOM line that asked for it, so the BOM can show
  "requested 120" and a second click updates the open request instead of duplicating it.
- Later: `kind` (`purchase` / `transfer`) + `source_warehouse` for transfer requests.

### Migration of existing data
1. Production `Reservation` rows (`sources[].type == "production"`): for each BOM that has them, set
   `reserved_at` (earliest `reservation_date`) and `stock_warehouse` (the BOM's own, else the only
   warehouse, else the warehouse most of its rows were assigned in step 2), then delete the rows.
   `reserved_by` stays empty: the old rows store a free-text name, not a user.
   BOMs where no warehouse can be determined stay unreserved and are listed in the migration output.
2. All reservations (runs first, in the warehouse migration): `warehouse` = the only warehouse if there is one, otherwise the warehouse
   holding most stock of the component; left `NULL` only when nothing applies.
   `NULL` is treated conservatively as "blocks in every warehouse" and flagged in the UI until
   someone assigns a warehouse.

## Availability service

`nextintranet_warehouse/services/availability.py` is the single source of truth, used by the BOM,
component detail, store list, dashboard and MCP.

```python
component_availability(component_ids, exclude=None) -> {
    component_id: {
        warehouse_id: {
            "on_hand": float,    # stocked packets in the warehouse subtree
            "reserved": float,   # sum of all reservations in this warehouse, whatever the source
            "free": float,       # on_hand − reserved (may be < 0)
            "reservations": [ {source, ref_id, label, quantity} ],  # breakdown for UI
        },
        ...
    }
}
```

There is a single "reserved" figure. Where a reservation comes from (`manual`, `production`, …)
is only a label on each entry, not a separate bucket.

- **On hand** counts only `PacketState.STOCKED` packets (negative counts included, they are real
  over-consumption). Packets without a location are reported under `"unassigned"`.
- **Reservation sources**: a small registry of providers. Manual reservations (the `Reservation`
  table, active only) are one provider; `nextintranet_production` registers the production
  provider in `apps.ready()` (the warehouse app must not import production). Each provider returns
  reservation entries per component/warehouse and a subquery for list-view annotations. New
  sources plug in here.
- **Self-exclusion**: `exclude={("production", line_id)}` so a BOM line does not compete with
  itself (other lines of the same BOM still count).
- **List views** sum the providers' subqueries (stocked packets, active manual reservations,
  production via `Greatest(needed − placed, 0)`), no Python loops.
- `Component.count`, `count_warehouse` and `get_inventory_summary` delegate to the service.

## API

- `POST /api/v1/production/templates/<id>/reserve/` and `/unreserve/` — set/clear `reserved_at`.
  Replace the per-line POSTs from the frontend.
- `PATCH` template accepts `stock_warehouse`.
- `GET /api/v1/production/templates/<id>/availability/` — per line:
  ```
  needed_total, placed_total, remaining,
  here: {warehouse, on_hand, reserved_by_others, free},
  elsewhere: [{warehouse, free}],
  requested: {request_id, quantity} | null,
  status: "ok" | "elsewhere" | "missing" | "requested"
  ```
  `elsewhere` lists only warehouses with `free > 0`. Status is `elsewhere` when another warehouse
  could cover the shortage, `missing` when no warehouse can.
- `POST /api/v1/production/template-components/<id>/request/` — create or update the open
  `PurchaseRequest` for the line (quantity defaults to the shortage, target = BOM warehouse).
  Bulk variant on the template: "Request all missing".
- `GET /api/v1/production/productions/used-in/?component=` — add `stock_warehouse`, `reserved`
  (bool) and `reserved_quantity` (remaining demand).
- Reservations API: `warehouse` and `expiration_date` in the serializer, `?warehouse=` filter,
  validation that `warehouse` has `is_warehouse`.
- MCP: `get_bom_availability` returns the new row shape; `create_reservation` / `update_reservation`
  take `warehouse`; new `reserve_bom` / `unreserve_bom` write tools.

## UI

**BOM view (ProductionPage)**
- Header: warehouse picker (warehouses only) next to "Reserve BOM" / "Unreserve BOM". The button state
  comes from `reserved_at`, not from counting reservation rows.
- Per line, the availability cell shows:
  ```
  Praha:  200 on hand, 80 reserved by others → 120 free     ✓
  Brno:    40 free
  Requested: 50 (to Praha/Regál A)
  ```
  Colour: green `ok`, amber `elsewhere`, red `missing`, blue `requested`.
- "Request component" button on `elsewhere`/`missing` lines, plus "Request all missing" in the header.

**Component detail**
- Inventory card: table per warehouse — on hand, reserved (with per-source breakdown), free.
- "Used in manufacturing": per BOM show warehouse and reserved remaining quantity, highlighted when
  the BOM is reserved.
- "On reservation list": manual reservations with warehouse and expiration.

**Store list**: 🔒 shows reserved total; tooltip breaks it down per warehouse.

**Purchase requests**: target location column and filter; link back to the BOM line.

## Implementation phases

1. **Backend core** — *done.* Migrations (`Warehouse.is_warehouse`, `Reservation.warehouse`,
   `Template.stock_warehouse/reserved_*`, data migration), `active()` manager, availability service
   + production provider, reserve/unreserve endpoints and MCP tools, new availability row shape
   (legacy keys kept), existing callers switched to the service. Minimal UI: Reserve/Unreserve use
   the new endpoints, warehouse checkbox on locations, warehouse/expiry in reservation detail,
   per-warehouse `inventory_summary.warehouses` and `used-in` reserved quantity in the API.
   Tests: `nextintranet_production/test_reservations.py`.
2. **BOM UI** — warehouse picker, reserve/unreserve via new endpoints, per-warehouse availability cell.
3. **Component pages** — per-warehouse inventory, used-in with reserved quantity, store list tooltip.
4. **Request component** — `PurchaseRequest.target_location` + `template_component`, line/bulk
   request endpoints and buttons, request list column/filter.
5. **Later** — transfer requests between warehouses, incoming supply (expected packets + ordered
   purchase requests) in availability, priority ordering by `planned_date` when free < 0.

## Tests

Scenario from the requirement, warehouse Praha with 100 pcs of component A:
- BOM B (reserved, needs 10), BOM C (reserved, needs 15), manual reservation 5 →
  B sees free 70 + own 10, C sees free 70 + own 15; component free in Praha = 70.
- B places 10 → stock 90, B demand 0, C still sees 85 available to it (no double counting).
- B finalized with 2 unplaced → demand 0 after finalize.
- BOM D planned but not reserved → affects nobody.
- Change B `qty_planned` → demand follows without any sync step.
- 50 pcs in Brno → B line in Praha with shortage shows status `elsewhere`, Brno free 50.
- Expired manual reservation → ignored.
- Reservation in Brno does not reduce free stock in Praha.
- "Request component" twice on the same line → one open request, quantity updated.
- Packets in `expected` / `retired` state are not counted as on hand.
