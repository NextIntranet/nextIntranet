---
title: Suppliers
description: Manage suppliers and link components to their supplier order codes.
---

# Suppliers

A supplier is a vendor you buy components from. Manage them at
**Warehouse → Suppliers** (`/store/supplier`).

## Supplier fields

- `name`, `contact_info`, `website`.
- `link_template` — a URL pattern used to build a link to a component's product page
  on the supplier's site from its order code.
- `min_order_quantity` — minimum order quantity enforced by the supplier (e.g. parts
  sold in reels of 100).
- `api_plugin_instance` / `api_config` / `api_mapping` — optional connection to a
  supplier API plugin for fetching live price/stock/description data. See
  [Supplier API mapping](../../developer/supplier-api-mapping.md) for the full
  fetch/apply mechanics.

## Linking a component to a supplier

A **supplier relation** connects one component to one supplier with:

- `symbol` — the supplier's order code, used both as the display code and as the
  lookup key for API fetches.
- `custom_url` — overrides the supplier's `link_template` for this specific item.
- `api_price` / `api_availability` — last known price and stock from the supplier
  API, when one is configured.

A component can have multiple supplier relations (e.g. the same part sourced from
two distributors); [Purchases](purchases.md) can be built from either the component
directly or from a specific supplier relation.

## Related topics

- [Purchases](purchases.md) — ordering from a supplier
- [Supplier API mapping](../../developer/supplier-api-mapping.md) — declarative
  field mapping from a supplier's API response into component fields
