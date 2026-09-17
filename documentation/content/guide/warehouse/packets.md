---
title: Packets & stock operations
description: Physical stock batches, their lifecycle states, and the operations that move quantity.
---

# Packets & stock operations

A **packet** is one physical batch of a component at one location — the unit that
carries a count, a location, and (via stock operations) a price. A component
typically has many packets spread across different locations.

## Packet fields

- `component` — what it holds.
- `location` — where it is. A packet can only be saved to a location with
  **Can store items** enabled (see [Locations](locations.md)); saving to any other
  location is rejected.
- `count` — current quantity, kept in sync by stock operations.
- `state` — the physical lifecycle (below); `is_active` is derived from it and kept
  only for backwards compatibility with older integrations.

## Packet states

| State | `is_active` | Meaning |
|---|---|---|
| `expected` | false | Created by exporting a purchase order; no stock yet, but has a location and can have a label printed ([Purchases](purchases.md)). |
| `stocked` | true | Normal, countable stock. |
| `in_transit` | true | Moving between locations; still counts as active stock. |
| `retired` | false | No longer tracked as live stock. |

Only `stocked` and `in_transit` packets count toward inventory totals, location
searches, and BOM availability.

## Stock operations

Every quantity change is recorded as a `StockOperation` against a packet:

| Type | Meaning |
|---|---|
| `add` | Manual stock increase |
| `remove` | Manual stock decrease |
| `adjust` | Correction not tied to a physical count |
| `trans_in` / `trans_out` | Transfer between locations (in/out side) |
| `buy` | Received from a purchase, carries `unit_price` |
| `sell` | Sold out of stock |
| `service` | Withdrawn for internal service/repair use |
| `inventory` | Recorded during a [stocktaking campaign](inventory.md) |

Each operation stores `quantity` (relative by default, or an absolute value when
`relative_quantity` is false), an optional `unit_price` used for FIFO pricing, and a
free-form `metadata` JSON blob. See [Packet pricing](pricing.md) for exactly how
`unit_price` on `add` / `trans_in` / `buy` operations drives the packet's computed
`itemValue`.

## Related topics

- [Packet pricing](pricing.md) — FIFO valuation and the price source badge
- [Purchases](purchases.md) — how `expected` packets are created and stocked
- [Inventory](inventory.md) — counting campaigns, which write `inventory` operations
- [Put-away check](put-away.md) — verifying a packet is on the right shelf
