---
title: Packet pricing
description: How unit prices and total values are calculated for packets, including FIFO, internal price fallback, and inventory snapshots.
---

# Packet pricing

Each packet (physical stock location) carries two computed price fields:

| Field | Description |
|---|---|
| `itemValue` | Price per unit (computed) |
| `totalValue` | `itemValue × count` |

Both are recalculated automatically whenever a `StockOperation` is saved.

---

## Calculation order (`Packet.calculate()`)

The algorithm runs in three steps:

### 1. FIFO from priced inflow operations

Operations of type `add`, `trans_in`, and `buy` with `unit_price > 0` form price layers ordered chronologically. Outflow operations (`remove`, `trans_out`, `service`, `sell`) consume the oldest layers first (FIFO).

The remaining layers after consuming all outflows give a **FIFO value** and a **FIFO count**.

### 2. Average price for unaccounted units

If `packet.count > FIFO count` (i.e. some units have no matching priced inflow), the gap is filled using the **average purchase price** across all priced inflow operations:

```
unaccounted = packet.count − FIFO count
average_price = Σ(quantity × unit_price) / Σ(quantity)   [over priced inflows]
total_value = FIFO value + unaccounted × average_price
```

### 3. Internal price fallback

If there are **no priced inflow operations at all** (step 2 denominator is zero), the gap is filled using `component.internal_price`:

```
total_value = FIFO value + unaccounted × component.internal_price
```

If `internal_price` is also not set, the unaccounted units are valued at 0 and `itemValue` will be 0.

---

## Price source badge

The packet detail page shows a badge indicating which pricing method was used:

| Badge | Meaning |
|---|---|
| **Purchase (FIFO)** | `itemValue` comes from priced buy/add operations |
| **Internal price** | `itemValue` comes from `component.internal_price` fallback |
| **⚠ Internal price (not applied)** | `internal_price` is set but `itemValue` is still 0 (packet may be empty or needs recalculation) |
| **No price** | Neither purchase price nor `internal_price` is available |

---

## Inventory operations

When an inventory (`operation_type = 'inventory'`) is recorded, the current `itemValue` of the packet is **snapshotted** into the operation's `metadata`:

```json
{
  "counted_quantity": 10,
  "recorded_quantity": 8,
  "counted_price": 45.50
}
```

`counted_price` captures the price at the moment of counting — it will not change even if subsequent purchases alter the packet's `itemValue`.

---

## Inventory PDF report

The stocktaking PDF report (`GET /api/warehouse/stocktaking/<id>/report/`) uses `counted_price` from metadata to value each inventoried packet:

```
value = counted_quantity × counted_price
```

For inventory operations recorded before `counted_price` was introduced, the report falls back to the packet's current `itemValue`. This fallback will be removed once all legacy operations have been superseded.

Non-inventoried packets are valued using their current `itemValue`.

---

## `component.internal_price`

`internal_price` is a manually maintained field on the component. It represents the agreed internal cost per unit and is used as a fallback when no purchase price history exists.

It can be set via the component edit form or via the MCP tool `update_component`.
