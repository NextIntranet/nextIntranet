---
title: Permissions & roles
description: How area-based access levels control what a user can see and do.
---

# Permissions & roles

NextIntranet has no separate "roles" concept — access is granted per user, per
functional **area**, as a single access **level**. There is no group/role table to
manage; you assign areas directly on each user.

## Areas and levels

Each user can have at most one permission row per area:

| Area | Used for |
|---|---|
| `warehouse` | Catalog browsing, reservations, purchase requests, component documents |
| `warehouse-operations` | Purchases (viewing/building orders) |
| `user` | Managing other users' accounts and permissions |

Levels, from lowest to highest:

`hidden` < `guest` < `read` < `write` < `admin`

A user with no row for an area is treated as having no access at all (equivalent to
`hidden`) — areas are opt-in, not opt-out.

Each API endpoint declares the area and minimum level it needs (most read endpoints
need `read`; most writes need `write`). A user must have at least that level in that
area to use the endpoint; the same check runs again in the UI so unavailable actions
are hidden rather than merely rejected server-side.

## Superuser bypass

A Django superuser bypasses **all** area/level checks entirely — this is the
"superadmin" mentioned elsewhere in the docs (e.g. in the
[plugin system](../../developer/plugin-system.md)). Use it sparingly; it is not
scoped to any particular area.

## Managing permissions

Open **Users** (`/user`) and a specific user's detail page (`/user/<id>`) to add,
change, or remove their area/level rows. A user editing their own profile can only
change their own name and email — permission and password changes on your own
account are silently ignored by the API, even if submitted.

## Related topics

- [Service tokens](service-tokens.md) — a separate, scope-based access mechanism for
  devices and integrations (not tied to a user's area permissions)
