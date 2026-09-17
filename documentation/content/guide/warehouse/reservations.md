---
title: Reservations
description: Reserve stock for projects and orders.
---

# Reservations

Reservations let you allocate component stock for a purpose without removing
packets from the warehouse immediately. A reservation does not move or lock any
specific packet — it only records that some quantity of a component is spoken for.

## Fields

- `component` — the reserved component.
- `quantity` — how much is reserved (float, so continuous units like meters work too).
- `reserved_by` — free-text name of who made the reservation.
- `priority` — 1 (highest) to 5 (lowest), default 3.
- `expiration_date` — optional; reservations don't expire automatically, this is
  informational for now.
- `sources` — a structured JSON list recording *why* the reservation exists, e.g.
  `[{"type": "production", "bom_id": "...", "line_id": "..."}]`. This is how a
  production BOM's own reservations are tagged.

## Create reservation

1. Open **Warehouse → Reservations** (`/store/reservations`).
2. Create a new reservation and link the target component.
3. Set quantity, priority, and notes as required by your process.

## View and update

Open a reservation from the list (`/store/reservations/<id>`) to adjust quantity,
priority, or metadata.

## Interaction with BOM availability

A production [BOM's availability check](../production/boms.md#availability) treats
its own reservations differently from everyone else's: stock reserved by *other*
BOMs reduces what's available, but a BOM's own reservations for itself do not — so
locking in a reservation for a BOM doesn't make that same BOM appear short on stock.

## Permissions

Requires at least **read** access to the *warehouse* area to view, and **write** to
create or change a reservation.
