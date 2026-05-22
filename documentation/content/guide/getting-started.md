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

- **KiCad** — Settings → Software (KiCad card) or the HTTP library endpoint (`/api/kicad/nextIntranet.kicad_httplib`)
- **MCP** — [MCP integration](settings/mcp.md)
- **Service tokens** — [Service tokens](settings/service-tokens.md) for printers and devices
