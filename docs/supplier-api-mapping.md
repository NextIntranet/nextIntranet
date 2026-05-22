# Supplier API mapping

When raw data is fetched from a supplier API (e.g. via the REST plugin), it is stored in **SupplierRelation.api_data** as `payload` or `raw`. The **API mapping** (stored on **Supplier** as `api_mapping`) defines how that payload is applied to the component and to the supplier relation.

Mapping is applied when you click **Apply mapping** on a supplier relation; you can also send a one-off mapping in the request body.

## Payload shape

The payload is whatever the plugin returns. Often it is an **array with one object** (e.g. Mouser: `payload[0]`). Use dot paths or list indices in `source`:

- `"0.ImagePath"` → first element’s `ImagePath`
- `"0.Category"` → first element’s `Category`
- `"LeadTime"` → root object’s `LeadTime` (if payload is already the single object)

Example payload (one item in array):

```json
{
  "payload": [
    {
      "Min": 1,
      "Mult": 1,
      "Category": "Jednodeskové počítače",
      "LeadTime": "94 Dny",
      "ImagePath": "https://www.mouser.com/images/raspberrypi/images/SC01949_SPL.jpg",
      "ROHSStatus": "RoHS Compliant"
    }
  ]
}
```

## Mapping schema

Root key: **`fields`** — object of field keys to configs.

Each config:

| Key | Required | Description |
|-----|----------|-------------|
| `source` | yes | Dot path (or list of keys) into the payload, e.g. `"0.ImagePath"`, `"Description"`. |
| `target` | yes | Where to write. See targets below. |
| `policy` | no | `always` \| `if_empty` \| `never`. Default `if_empty`. |
| `description_mode` | no | For `component.description` only: `overwrite` \| `prepend` \| `append`. Default `overwrite`. |
| `item_map` | no | For documents/parameters: paths for `name`, `value`, `url`, `unit`, `doc_type`. |
| `param_name_map` | no | For `component.parameters`: map API parameter name → our ParameterType name. |

### Targets

- **component.name** — component name
- **component.description** — description (supports `description_mode`)
- **component.primary_image** — primary image URL (e.g. from `ImagePath`)
- **component.documents** — list of documents; each item can have `url`, `name`, `doc_type` (use `doc_type: "image"` for image links)
- **component.parameters** — list of parameters; each item: `name`, `value`, optional `unit`; use `param_name_map` to map API param names to ours
- **supplier_relation.api_price** — numeric price from API (stored on the relation)
- **supplier_relation.api_availability** — availability/stock text (e.g. "In Stock", "94 Dny")

## Example mapping (Mouser-like payload)

Payload is an array with one object; we use `0.` prefix for sources.

```json
{
  "fields": {
    "primary_image": {
      "source": "0.ImagePath",
      "target": "component.primary_image",
      "policy": "always"
    },
    "description": {
      "source": "0.Description",
      "target": "component.description",
      "policy": "if_empty",
      "description_mode": "append"
    },
    "api_price": {
      "source": "0.UnitPrice",
      "target": "supplier_relation.api_price",
      "policy": "always"
    },
    "api_availability": {
      "source": "0.LeadTime",
      "target": "supplier_relation.api_availability",
      "policy": "always"
    },
    "parameters": {
      "source": "0.ProductAttributes",
      "target": "component.parameters",
      "policy": "if_empty",
      "item_map": {
        "name": "AttributeName",
        "value": "AttributeValue"
      },
      "param_name_map": {
        "ROHS Status": "RoHS",
        "Lead Time": "Lead time"
      }
    }
  }
}
```

Store this JSON in **Supplier** → **API mapping** (or send it in the apply request body as `mapping` and optionally `save_mapping: true`).
