---
title: Product overview
description: What NextIntranet offers for warehouse and operations teams.
---

# Product overview

NextIntranet centralizes warehouse data, production information, and device
integrations behind a single authenticated web application.

## Core areas

| Area | Purpose |
|------|---------|
| Warehouse | Components, categories, stock packets, locations, suppliers, reservations, stocktaking |
| Production | Products, BOMs, sourcing/placement scanning, live iBOM board views |
| Print | Label templates, print queues, and async render jobs for hardware |
| Settings | Permissions, service tokens, MCP, KiCad, and hardware bridges |

## Integrations

- **KiCad HTTP library** — pull symbols from your warehouse's own component catalog
- **MCP server** — let AI agents search and update warehouse and production data securely
- **Service tokens** — authenticate printers and other services without user login
- **HW agent / Web Serial** — bridge barcode scanners and label printers, either via a
  small local service or directly from the browser

## Access model

Access is granted per user, per functional area (`warehouse`, `warehouse-operations`,
`user`), at one of five levels (`hidden` → `admin`). There is no separate roles
table — see [Permissions & roles](../guide/settings/permissions.md).

See [Features](features.md) for a capability checklist.
