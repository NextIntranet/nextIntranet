---
title: Locations
description: Hierarchical warehouse locations, storage flags, and location maps.
---

# Locations

Locations model the physical structure of a warehouse — buildings, rooms, shelves,
bins — as a tree. Internally the model is called `Warehouse`, but in the UI and API
paths it is always called a **location** (`/store/location`).

## Hierarchy

- Every location has an optional `parent`, building an unlimited-depth tree (backed
  by MPTT for efficient subtree queries).
- `full_path` joins the ancestor chain with `/`, e.g. `Building A / Room 2 / Shelf 4`.
- There is no separate "location type" field — a location is either a structural node
  (building, room) or a storage node, distinguished only by **Can store items**.

## Can store items

A boolean flag, off by default, meaning "components can physically be placed here."

- Packets can only be saved to a location where this flag is on — saving a packet to
  a non-storage location is rejected at the model level.
- The [put-away check](put-away.md) warns when a scanned shelf is not marked as able
  to store items.
- Structural nodes (buildings, rooms, cabinets) normally keep this off so they can't
  accidentally receive stock directly — only their storage children can.

## Picking a parent location

The parent picker (`LocationParentSelect`, used when creating or editing a location)
shows the whole tree as a single searchable dropdown, indented by depth, with a
synthetic **No parent** option for roots. It excludes the location currently being
edited so a location can't become its own ancestor. The same picker is reused
wherever a location needs to be chosen (purchases, packets, reservations).

## Location map

A location can have an SVG map file attached, useful for visually marking storage
positions on a floor plan or shelf diagram.

## API

| Method & path | Purpose |
|---|---|
| `GET/POST /api/warehouse/location/` | List / create locations |
| `GET/PUT/PATCH/DELETE /api/warehouse/location/<id>/` | Single location |
| `GET /api/warehouse/location/tree/` | Full tree, all roots (cached) |
| `GET /api/warehouse/location/<id>/tree/` | Subtree rooted at one location |
| `GET /api/warehouse/locations/` | Flat paginated list |
| `GET /api/warehouse/locations/tree/` | Top-level tree, roots only |

The same tree is exposed read-only over MCP as `list_locations` / `get_location`, and
writable as `create_location` / `update_location` / `delete_location` — see
[MCP integration](../settings/mcp.md).

## Related topics

- [Put-away check](put-away.md) — verify a bag belongs on a shelf
- [Packets](packets.md) — stock batches that live at a location
- [Categories](categories.md) — the equivalent hierarchy for classifying components
