---
title: Purchases
description: Order components from suppliers, receive them and book them into stock.
---

# Purchases

A purchase is one order to one supplier. It moves through a fixed sequence of statuses,
and each status unlocks the next part of the workflow.

## Lifecycle

| Status | What happens |
|--------|--------------|
| `draft` | The order exists; lines are being added. |
| `items_defined` | All lines are known. |
| `priced` | Unit prices are filled in. |
| `closed` | The order is final and will not change. |
| `exported` | The order was sent to the supplier. **Draft packets are created here.** |
| `receiving` | Goods are arriving; partial deliveries are recorded as they come. |
| `stocking` | Received deliveries are being booked into stock. |
| `completed` | Everything is delivered and stocked. |

## Stock locations and expected packets

Every component line has a **stock location** — where the goods will end up. It is set while
the order is still being built, in the Location column of the item table, not only at receiving
time. This is required: exporting the order is blocked until every component line has one.

On export, each component line gets a **packet in the `expected` state**. The packet exists,
sits at its target location and can have its label printed, but it holds no stock yet:

- `count` is 0 and `is_active` is false, so it is **not** counted in inventory totals,
  location searches or BOM availability.
- Inventory shows expected packets in a separate group below the active ones.
- Receiving a delivery attaches it to that same packet — one packet per order line, even when
  the goods arrive in several partial deliveries.
- Confirming stocking books the quantity in and flips the packet to `stocked`.

Packet states are `expected`, `stocked`, `in_transit` and `retired`. `is_active` is derived
from the state and kept only for backwards compatibility.

## Receiving and stocking

Receiving records what physically arrived. Enter a quantity per line — less than ordered is
fine, the rest can be received later. Optionally queue packet labels to a print queue in the
same step.

Stocking confirms the received deliveries: it creates the `buy` stock operation with the line's
unit price, flips the packet to `stocked`, and completes the purchase automatically once every
line is fully delivered and stocked.

## Purchase requests

Purchase requests are wishes to buy something, filed independently of any order. When you build
a purchase for a supplier, open requests can be attached to it so the wish is tracked through to
delivery.

## Automation

The whole flow is available over MCP — see [MCP integration](../settings/mcp.md).
