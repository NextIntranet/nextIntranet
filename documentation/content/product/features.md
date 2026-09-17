---
title: Features
description: Capability overview for NextIntranet.
---

# Features

## Warehouse

- Component catalog with parameters, documents, tags, and hierarchical [categories](../guide/warehouse/categories.md)
- Hierarchical [locations](../guide/warehouse/locations.md) and stock [packets](../guide/warehouse/packets.md) (batches), with FIFO-based [pricing](../guide/warehouse/pricing.md)
- [Supplier](../guide/warehouse/suppliers.md) relations, optional live API price/stock sync, and full [purchase order](../guide/warehouse/purchases.md) workflows
- [Reservations](../guide/warehouse/reservations.md) and [stocktaking campaigns](../guide/warehouse/inventory.md) with a PDF valuation report
- [Put-away check](../guide/warehouse/put-away.md) for scan-and-verify shelving
- Global [search](../guide/search.md) across components, locations, packets, and more

## Production

- Product and [BOM management](../guide/production/boms.md), including netlist import, line splitting/merging, and lock/finalize workflows
- Per-line [stock availability](../guide/production/boms.md#availability) checks against live warehouse stock
- Barcode-driven sourcing and placement scanning
- [Live iBOM viewer](../guide/production/ibom.md) with stock/location overlay on an interactive board view

## Printing

- [Print queues](../guide/printing/print-queues.md) scoped by service token, shareable or private
- Async label render jobs producing PDFs, for single labels or A4 sheet layouts
- Visual and JSON [label template](../guide/printing/label-templates.md) editor per target type (component/packet/location)

## Access control

- Area-based [permissions](../guide/settings/permissions.md) (`hidden`/`guest`/`read`/`write`/`admin`) assigned per user, no separate roles table
- Superadmin bypass for administrative tasks

## Hardware

- Local HW agent bridge for barcode scanners and CUPS-connected printers, or direct browser [Web Serial](../guide/settings/hardware.md) scanning — no agent required

## Integrations

- [KiCad HTTP library](../guide/settings/kicad.md) — browse warehouse components as a live KiCad symbol library
- [MCP server](../guide/settings/mcp.md) — let AI agents search and update warehouse and production data securely

## Extensibility

- In-repo plugin system with extension points (see [Plugin system](../developer/plugin-system.md))
