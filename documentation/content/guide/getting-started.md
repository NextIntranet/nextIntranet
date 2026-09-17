---
title: Getting started
description: Run NextIntranet locally and sign in.
---

# Getting started

## Run with Docker

From the repository root:

```bash
docker compose up --build
```

Configure environment variables in `.env` (Postgres, Redis, S3/MinIO, secrets).

## Sign in

Open the React frontend (default dev port `5173` when running Vite locally, or
your Docker/nginx URL in composed setups). Authenticate with your configured
user account.

## Explore the warehouse

1. Open **Warehouse** from the sidebar.
2. Browse components, locations, and categories.
3. Open a component detail page to edit parameters, documents, and stock.

## Configure integrations

- **KiCad** — [KiCad HTTP library](settings/kicad.md)
- **MCP** — [MCP integration](settings/mcp.md)
- **Service tokens** — [Service tokens](settings/service-tokens.md) for printers and devices
- **Hardware** — [Hardware](settings/hardware.md) to connect barcode scanners and printers

## Where to go next

- [Product overview](../product/overview.md) — the full list of areas and how they fit together
- [Components](warehouse/components.md), [Categories](warehouse/categories.md), [Locations](warehouse/locations.md) — the core warehouse catalog
- [Purchases](warehouse/purchases.md), [Inventory](warehouse/inventory.md) — day-to-day warehouse operations
- [BOMs](production/boms.md) — production BOM workflows
- [Print queues](printing/print-queues.md) — printing labels for components, packets, and locations
