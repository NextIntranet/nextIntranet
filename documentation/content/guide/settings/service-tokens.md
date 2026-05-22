---
title: Service tokens
description: Long-lived credentials for devices and integrations.
---

# Service tokens

Service tokens are long-lived credentials for service-to-service access
(e.g., printer drivers, barcode readers). They are separate from user JWT
auth and are meant for system integrations.

## Why

- Provide stable authentication for devices/services without user login.
- Limit access to specific print queues and actions.
- Avoid long-running requests by using async print render jobs.

## How it works

- Token is stored hashed; raw value is shown only once on creation.
- Access is scoped via:
  - allowed print queues (per token)
  - optional scopes list (currently used: `print:render`, `mcp:read`, `mcp:write`)
- Token can expire via `expires_at`.

## Headers

Use one of:

- `X-Service-Token: <token>`
- `Authorization: Service <token>`

## Create a token

```bash
python manage.py create_service_token "Printer A" \
  --print-list <QUEUE_UUID> \
  --scope print:render \
  --expires-in 604800
```

Notes:

- `--print-list` is repeatable; token is limited to those queues.
- `--scope` is optional, but if scopes are present the render API requires
  `print:render`.
- `--expires-in` is seconds from now; omit for no expiry.

## Current usage

- `/api/v1/print/render/` accepts service tokens.
- Service tokens can only render labels from allowed queues.
- MCP uses `mcp:read` and `mcp:write` scopes — see [MCP integration](mcp.md).

## Operational notes

- `debug_middleware` logs Authorization headers; disable it in production
  to avoid token leaks.
- Rotate tokens by creating a new one and disabling the old one.
