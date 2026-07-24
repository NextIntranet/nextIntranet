---
title: Supplier API mapping
description: How supplier API data is fetched and mapped into component fields.
---

# Supplier API Mapping

This document describes how data returned by a supplier's API is fetched, stored,
and mapped into component fields. The mapping is **declarative** (JSON configuration
per supplier) rather than hard-coded, so new suppliers can be onboarded without code
changes.

The logic lives in `nextintranet_warehouse/services/supplier_api.py`.

## Overview

The flow has two independent steps:

1. **Fetch** — call the supplier's API plugin and store the raw response on the
   supplier relation. Nothing is written to the component yet.
2. **Apply** — read the stored response and copy selected values into the component
   (and the relation) according to the supplier's mapping configuration.

Keeping fetch and apply separate means the raw payload can be inspected (and the
mapping adjusted) before anything is written to the component.

## Data model

The mapping relies on three existing records:

- **`Supplier`**
  - `api_plugin_instance` — the `PluginInstance` used to call the API.
  - `api_config` — supplier-specific config, merged over the plugin instance config.
  - `api_mapping` — the JSON mapping configuration (see below).
- **`SupplierRelation`** (component ↔ supplier link)
  - `symbol` — the supplier's order code, sent to the API as the lookup key.
  - `api_data` — the stored API response: `{raw, payload, fetched_at, source}`.
  - `api_data_hash`, `api_fetched_at`, `api_applied_at` — bookkeeping.
  - `api_price`, `api_availability` — targets the mapping can write to.
- **`Component`** — the ultimate target for `name`, `description`, `primary_image`,
  documents, and parameters.

## Step 1 — Fetch

`fetch_supplier_relation_payload(supplier_relation, user=None, symbol_override=None)`:

1. Resolves the supplier's `api_plugin_instance`, checks it is enabled and that the
   user may access it (`user_can_access_instance`).
2. Merges `PluginInstance.config` with `Supplier.api_config` (dict keys `headers`,
   `query_params`, `body` are deep-merged one level).
3. Executes the plugin with `{"action": "fetch_component", "symbol": <symbol>}`.
4. Stores the response on the relation:

   ```json
   {
     "raw": "<original response>",
     "payload": "<normalized payload>",
     "fetched_at": "<iso timestamp>",
     "source": { "definition_key": "...", "symbol": "..." }
   }
   ```

   It also sets `api_data_hash`, `api_fetched_at`, and updates
   `Supplier.api_last_sync_at`.

The mapping in step 2 reads from `payload` (falling back to `raw` if `payload` is
absent).

## Step 2 — Apply

`apply_supplier_mapping(supplier_relation, mapping_override=None)` reads
`api_data.payload` and the mapping from `mapping_override` (if provided) or
`Supplier.api_mapping`.

### Mapping configuration shape

```json
{
  "fields": {
    "<any key>": {
      "source": "0.ImagePath",
      "target": "component.primary_image",
      "policy": "always | if_empty | never",
      "description_mode": "overwrite | prepend | append",
      "item_map": { "name": "...", "value": "...", "url": "...", "doc_type": "..." },
      "param_name_map": { "API Param Name": "Our Parameter Type Name" }
    }
  }
}
```

Each entry under `fields` is processed independently. The key name is arbitrary
(used only for reporting which fields were updated).

### `source` — reading a value from the payload

`source` is a path into the stored payload, resolved by `_extract_value`:

- Dot notation for nested dict keys: `"Parameters.Weight"`.
- Numeric segments index into lists: `"0.ImagePath"` reads `payload[0]["ImagePath"]`.
- May also be given as a list of keys instead of a dotted string.

If the path resolves to `None`, the field is skipped.

### `target` — where the value is written

`target` is a **whitelist**; any value not listed below is ignored.

| `target` | Effect |
| --- | --- |
| `component.name` | Set the component name (string). |
| `component.description` | Set the description, honoring `description_mode`. |
| `component.primary_image` | Set the primary image URL (string). |
| `supplier_relation.api_price` | Parsed to `Decimal`; skipped if unparseable. |
| `supplier_relation.api_availability` | Availability string. |
| `supplier_relation.custom_url` | Product URL override. The relation's derived `url` uses this, or falls back to the supplier's `link_template` + `symbol`. |
| `supplier_relation.symbol` | Supplier order code. |
| `supplier_relation.description` | Supplier-side description of the item. |

All `supplier_relation.*` targets write to the **same relation the API request came
from**, so its `supplier` (and `supplier_id`) is already correct and is never changed
by the mapping. `supplier_relation.*` targets honor `policy` just like component
fields (e.g. `if_empty` only fills a blank field).
| `component.documents` | Create `Document` rows (see `item_map`). |
| `component.parameters` | Create `ComponentParameter` rows (see `item_map` / `param_name_map`). |

`description_mode` (only for `component.description`): `overwrite` (default),
`prepend`, or `append` — controls how the new text combines with the existing one.

### `policy` — when to write

Handled by `_policy_allows_update`:

- `always` — always write.
- `if_empty` — write only when the target field is currently empty (the default when
  `policy` is omitted).
- `never` — skip the field entirely.

For `component.documents` and `component.parameters`, `if_empty` means "skip if the
component already has any document/parameter"; otherwise rows are appended with
de-duplication.

### Collections: documents and parameters

- **Documents** (`_apply_documents`): each item yields a `Document` with `url`,
  `name`, and `doc_type`. `item_map` maps payload keys to those fields; without it,
  common keys are guessed (`url`/`link`, `name`/`title`, `doc_type`/`type`). Existing
  URLs are skipped, so re-applying does not create duplicates.
- **Parameters** (`_apply_parameters`): each item yields a `ComponentParameter`. The
  parameter's `ParameterType` is fetched or created by name (`param_name_map` lets you
  rename an API parameter to an existing internal `ParameterType`). Units are filled in
  when missing. Duplicate `(parameter_type, value)` pairs are skipped.

### Result

`apply_supplier_mapping` returns a summary:

```json
{
  "documents_added": 0,
  "parameters_added": 0,
  "fields_updated": ["<field keys that changed>"]
}
```

It also stamps `SupplierRelation.api_applied_at`.

## API endpoints

- `POST /api/v1/store/supplier/relation/<uuid:pk>/apply/`
  (`SupplierRelationApplyAPIView`, `views/supplier_api.py`). Accepts an optional
  `mapping` override in the body, and `save_mapping: true` to persist that override to
  `Supplier.api_mapping`.
- The fetch/sync counterpart is exposed on the relation as well
  (`.../sync/`) and surfaced in the frontend via `ComponentDetailPage`
  (`syncSupplierRelationMutation` and `applySupplierRelationMutation`).

## Adding a new mapped field

1. Confirm the value exists in the stored `api_data.payload` and note its path.
2. If the `target` is one of the whitelisted keys above, add a `fields` entry to the
   supplier's `api_mapping` (via the apply endpoint with `save_mapping`, or the admin
   form). No code change needed.
3. If you need a **new target field**, extend the `target` handling in
   `apply_supplier_mapping` (add the branch and, if it is a scalar component field,
   include it in the allowed set at the `component.<field>` check).
