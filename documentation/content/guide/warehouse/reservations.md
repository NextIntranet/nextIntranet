---
title: Reservations
description: Reserve stock for projects and orders.
---

# Reservations

A reservation marks part of a component's stock as spoken for, so it is no longer
counted as available. It does not move or lock any specific packet.

Stock is reserved in a **warehouse** — a [location flagged as warehouse](locations.md#warehouse).
A reservation holds stock only in its own warehouse; stock in other warehouses is
unaffected.

Two things hold stock:

- **Manual reservations** — rows on the Reservations page, described below.
- **Reserved production BOMs** — a BOM that has been reserved holds what its lines still
  need, computed live from the BOM. See [BOM availability](../production/boms.md#availability).

Both count the same way. Everywhere stock is shown there is a single *reserved* figure,
and each reservation in the breakdown carries a label saying where it comes from.

## Fields

- `component` — the reserved component.
- `quantity` — how much is reserved (float, so continuous units like meters work too).
- `warehouse` — where the stock is held. When omitted, the warehouse of your home
  location is used, or the only warehouse if there is just one. Reservations created
  before warehouses existed may have no warehouse; those hold stock in every warehouse
  until one is assigned.
- `reserved_by` — who made the reservation.
- `priority` — 1 (highest) to 5 (lowest), default 3.
- `expiration_date` — optional; after this date the reservation no longer holds stock.
- `sources` — a structured JSON list recording *why* the reservation exists.

## Create reservation

- **Warehouse → Reservations** (`/store/reservations`) → **New reservation**: pick the
  component, quantity, warehouse, priority, optional expiry date and a note.
- On a component page, **⋯ → Reserve** opens the same form with the component filled in.
- Over the API (`POST /api/v1/store/reservations/`) or the [MCP server](../settings/mcp.md).

If no warehouse is chosen, the warehouse of your home location is used (or the only
warehouse, if there is just one).

## View and update

The list shows each reservation's warehouse and marks expired ones. Open a reservation
(`/store/reservations/<id>`) to change its quantity, warehouse, priority, expiry or note.

Creating, changing and deleting a reservation, as well as reserving and unreserving a BOM,
is recorded in the component's activity log.

## Permissions

Requires at least **read** access to the *warehouse* area to view, and **write** to
create or change a reservation.
