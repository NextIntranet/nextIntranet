---
title: Inventory (stocktaking)
description: Run stocktaking campaigns, count packets, and generate the valuation report.
---

# Inventory (stocktaking)

A **stocktaking campaign** is a time-boxed effort to physically count stock. There is
no separate "count line" model — every count is written as an `inventory` stock
operation on the packet, tagged with the campaign.

## Creating a campaign

Open **Warehouse → Inventory campaigns** (`/store/inventory-campaign`) and create a
campaign with a name, description, and an optional `open_from` / `open_until` /
`target_date` window.

Only **one campaign can be active at a time** — activating a new one is rejected
while another is already active. This keeps every count made in the counting UI
unambiguous about which campaign it belongs to.

## Counting

From **Warehouse → Inventory** (`/store/inventory`), scan or search for a packet and
enter the physically counted quantity. Behind the scenes this posts an `inventory`
stock operation with:

- `counted_quantity` — what you physically counted.
- `recorded_quantity` — what the system had before the count.
- `counted_price` — a snapshot of the packet's `itemValue` at the moment of
  counting, so later purchases don't retroactively change the valuation of a
  completed count (see [Packet pricing](pricing.md)).

The operation's relative quantity is computed as `counted − recorded`, so the
packet's `count` ends up matching what you entered, and a human-readable note
("Physical count: X (recorded: Y)") is attached automatically.

## Tracking progress

- `/store/inventory/status` shows per-location progress: how many packets at each
  location are already inventoried versus still pending, for the active campaign.
- `/store/inventory/packets` lists packets scoped to the campaign.
- The campaign list itself shows an overall progress percentage (inventoried vs.
  pending active packets).

## Finishing a campaign

There is no explicit "finish" action — a campaign is wound down by setting it
inactive (or letting `open_until` pass) once every location has been counted.
Packets that were never inventoried during the campaign simply keep their previous
`itemValue` in the report (see below).

## Valuation report

`GET /api/warehouse/stocktaking/<id>/report/` renders a PDF (`inventura-<date>.pdf`)
valuing every inventoried packet as `counted_quantity × counted_price` from the
operation's metadata, with fallback to the packet's current `itemValue` for
non-inventoried packets or legacy operations recorded before `counted_price`
existed. See [Packet pricing → Inventory PDF report](pricing.md#inventory-pdf-report)
for the exact formula.

Query parameters let you tune what's included: `show_all`, `show_packets`,
`hide_zero_value`, `show_uninventoried`, `show_warnings`, `show_links`.

## Related topics

- [Packets & stock operations](packets.md) — what an `inventory` operation changes
- [Packet pricing](pricing.md) — how `counted_price` is captured and used
