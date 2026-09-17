---
title: NextIntranet
description: Warehouse, production, and operations in one intranet platform.
---

# NextIntranet

NextIntranet is an intranet platform for warehouse management, production BOMs,
printing, and integrations with external tools such as KiCad and MCP clients.

New here? Start with [Getting started](guide/getting-started.md), then use the
sections below to jump straight to the task you need.

## Warehouse

Catalog, stock, and day-to-day warehouse operations.

- [Components](guide/warehouse/components.md) — the catalog: parameters, documents, tags
- [Categories](guide/warehouse/categories.md) — classify components in a tree
- [Locations](guide/warehouse/locations.md) — where stock physically lives
- [Packets & stock operations](guide/warehouse/packets.md) — stock batches and how quantity changes
- [Pricing](guide/warehouse/pricing.md) — how packet value is calculated
- [Suppliers](guide/warehouse/suppliers.md) — vendors and order codes
- [Purchases](guide/warehouse/purchases.md) — order, receive, and stock deliveries
- [Reservations](guide/warehouse/reservations.md) — hold stock for a project or order
- [Inventory (stocktaking)](guide/warehouse/inventory.md) — count campaigns and the valuation report
- [Put-away check](guide/warehouse/put-away.md) — scan-and-verify shelving
- [Search](guide/search.md) — find anything by name, code, or scanned label

## Production

Turning a BOM into finished boards.

- [BOMs](guide/production/boms.md) — lines, linking components, availability, lock/finalize
- [Live iBOM viewer](guide/production/ibom.md) — interactive board view with a live stock overlay

## Printing

Labels, from design to printer.

- [Label templates](guide/printing/label-templates.md) — design what a label looks like
- [Print queues](guide/printing/print-queues.md) — queue and render labels as PDFs

## Settings & integrations

Access, devices, and connecting other tools.

- [Permissions & roles](guide/settings/permissions.md) — who can see and do what
- [Service tokens](guide/settings/service-tokens.md) — credentials for printers and integrations
- [Hardware](guide/settings/hardware.md) — connect barcode scanners and printers
- [KiCad HTTP library](guide/settings/kicad.md) — browse components as a KiCad symbol library
- [MCP integration](guide/settings/mcp.md) — connect Claude, Cursor, or other AI/MCP clients

## About NextIntranet

- [Product overview](product/overview.md) — capabilities and audience at a glance
- [Features](product/features.md) — full capability checklist

## For developers

Extending NextIntranet itself, rather than using it:

- [Plugin system](developer/plugin-system.md) — extension points and plugin instances
- [Supplier API mapping](developer/supplier-api-mapping.md) — declarative supplier data mapping
