---
title: Plugin system
description: In-repo plugin architecture and extension points.
---

# Plugin System Developer Guide

This document describes the in-repo plugin architecture, the API contracts, and how to implement new plugins. It is designed to be separable later with minimal changes.

## Overview
The plugin system adds functionality through explicit extension points. Plugins are registered by a stable `definition_key` and instantiated as one or more `PluginInstance` records with their own configuration and access controls.

Key properties:
- Backend is the source of truth for plugin availability and instance configuration.
- Frontend renders only enabled instances returned by the API.
- Each plugin can have multiple named instances.
- Permissions are enforced both server-side and client-side; superadmin bypasses role checks.

## Glossary
- **Plugin Definition**: Code-level registration describing a plugin type.
- **Plugin Instance**: A database record representing one configured instance of a plugin definition.
- **Extension Point**: A named UI slot that can be extended by plugins.
- **Capability**: A declaration of what a plugin instance can do.

## Extension Points
Initial list:
- `page.status`: top-bar menu area
- `packets.actions`
- `locations.actions`
- `component.actions`
- `printqueue.actions`
- `documents.actions`

Each plugin uses one or more of these to inject UI actions or status indicators.

## Backend Architecture

### Plugin Definition (Registry)
Each plugin is registered in code with a stable `definition_key` and metadata:

```json
{
  "definition_key": "printer.driver",
  "name": "Printer driver",
  "version": "1.0.0",
  "capabilities": ["packets.actions", "print.queue.consumer"],
  "config_schema": {
    "type": "object",
    "properties": {
      "supported_types": {
        "type": "array",
        "items": { "type": "string" }
      },
      "supported_formats": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["supported_types"]
  }
}
```

### Plugin Instance (DB)
Each instance has its own configuration and name:

```json
{
  "id": "uuid",
  "definition_key": "printer.driver",
  "name": "Label printer A",
  "enabled": true,
  "config": {
    "supported_types": ["label"],
    "supported_formats": ["single_label"]
  }
}
```

### Permissions
- `PluginInstanceRole` maps instances to roles.
- Superadmin bypasses role checks.
- Backend rejects any execute calls when the user lacks access.

### API Endpoints (Proposed)
- `GET /api/v1/plugins/instances/`
- `POST /api/v1/plugins/instances/`
- `PATCH /api/v1/plugins/instances/{id}/`
- `POST /api/v1/plugins/instances/{id}/execute`

The `execute` endpoint should accept a generic payload and validate it against the instance config and plugin handler.

## Frontend Architecture

### Plugin Registry
Frontend has a registry that maps `definition_key` to UI integration:

```ts
const pluginRegistry = {
  "printer.driver": {
    actions: {
      "packets.actions": PrinterPacketAction,
      "printqueue.actions": PrinterQueueAction
    }
  }
}
```

### Rendering Flow
1. Fetch plugin instances from `/api/v1/plugins/instances/`.
2. Filter to enabled instances and role-authorized user.
3. For each extension point, render matching actions from the registry.

### Action Configuration
Some actions require runtime configuration. The UI should:
- Render a modal based on a `config_schema` or action schema.
- Validate locally before calling `/execute`.
- Show user-facing errors via `sonner`.

## Printing Restrictions
Printing plugins must enforce what they can print.

Example config:
```json
{
  "supported_types": ["label", "invoice"],
  "supported_formats": ["single_label", "a4_sheet"]
}
```

Rules:
- UI must hide/disable printers that do not support the requested type/format.
- Backend must reject unsupported print jobs even if the UI fails to filter.
- Queue-based printers can accept batches; single-label printers should reject batches if unsupported.

## Example Plugin: PrinterDriver (Console Only)

Goal: add an action under `packets.actions` that logs label IDs to the console.

### Backend
- Register `printer.driver` definition.
- Allow instances with `supported_types` and `supported_formats`.
- Implement an `execute` handler that returns the labels list (or logs internally).

### Frontend
- Add an action button in `packets.actions`.
- When clicked, call `/api/v1/plugins/instances/{id}/execute`.
- Log the response to the console.

## File Layout (In-Repo)
- Backend: `nextintranet_backend/nextintranet_plugins/<plugin_key>/`
- Frontend: `nextintranet_frontend/packages/plugins/<plugin_key>/`
- Shared schemas: `documentation/content/` or a small shared folder, referenced by both sides.

## Extracting Later
To extract, keep contracts stable:
- `definition_key`, `capabilities`, `config_schema`
- API shape for listing instances and executing actions
- Extension point names

When extracting, move backend plugin code to a pip package and frontend plugin code to an npm package; keep the same interfaces.
