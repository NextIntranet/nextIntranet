---
title: MCP integration
description: Connect AI clients to the NextIntranet warehouse MCP server.
---

# MCP integration

NextIntranet exposes a warehouse MCP server at `/mcp` so AI agents (Claude Code,
Claude Desktop, Cursor, etc.) can query and modify warehouse data.

## Generate token

Use the intranet UI to create a token and configuration JSON in one step:

1. Go to **Settings → Software** (`/settings/software`).
2. In **Generate MCP config**, enter a token name.
3. Optionally customize the **MCP server name** (default `nextintranet-warehouse`).
4. Choose **Read-only** or **Read & Write** (write requires warehouse write permission).
5. Click **Generate config** and copy the JSON into your MCP client.

The generated JSON looks like:

```json
{
  "mcpServers": {
    "nextintranet-warehouse": {
      "type": "http",
      "url": "https://your-instance/mcp",
      "headers": {
        "X-Service-Token": "<generated-token>"
      }
    }
  }
}
```

### Claude Code setup

The fastest way is the CLI — run this once in a terminal:

```bash
claude mcp add --transport http nextintranet-warehouse https://your-instance/mcp \
  --header "X-Service-Token: <generated-token>"
```

Replace `https://your-instance` with your NextIntranet URL and `<generated-token>` with the token you copied in step 5 above.

Verify it was added:

```bash
claude mcp list
```

You should see `nextintranet-warehouse` in the list. The next time you open Claude Code, the warehouse tools are available automatically.

**Alternative — edit the config file manually:**

Open `~/.claude/claude_code_config.json` and add the server under `"mcpServers"`:

```json
{
  "mcpServers": {
    "nextintranet-warehouse": {
      "type": "http",
      "url": "https://your-instance/mcp",
      "headers": {
        "X-Service-Token": "<generated-token>"
      }
    }
  }
}
```

Create the file if it does not exist yet.

**Project-scoped config:** To restrict the MCP server to a specific project instead of all Claude Code sessions, pass `--scope project` to `claude mcp add`. This writes the server into `.mcp.json` in the current directory instead of your global config.

### Other clients

- **Claude Desktop**: `~/.claude/claude_desktop_config.json` under `"mcpServers"`
- **Cursor**: Settings → MCP Servers

Make sure the server entry includes `"type": "http"` (as in the examples above).
Some clients — e.g. Claude Desktop on macOS with more than one MCP server
configured — fail to recognize the NextIntranet server as a remote HTTP server
without this key.

## Available tools

### Read-only (`mcp:read` scope)

- `search_components` — search by name, description, category, tag, location
- `get_component_detail` — full component detail with parameters, documents, packets, suppliers
- `get_inventory_summary` — stock overview (`limit` default 200, max 500)
- `list_categories` — categories (`include_nested` default true, `limit` default 500, max 2000)
- `get_category` — single category (`include_nested` default true: subcategory tree)
- `list_locations` — locations (`include_nested` default true, `limit` default 500, max 2000)
- `get_location` — single location (`include_nested` default true; by id or legacy uuid)
- `list_parameter_types` — parameter types (`limit` default 500, max 2000)
- `list_suppliers` — supplier list
- `get_supplier` — single supplier
- `list_component_suppliers` — supplier links for a component (`limit` default 50, max 200)
- `list_reservations` — reservation list (filter by component or search)
- `get_reservation` — single reservation
- `get_packet` — single packet (stock batch)
- `list_component_packets` — packets for a component (`limit` default 100, max 500)
- `list_document_types` — allowed document type keys and labels (use keys in `doc_type`)
- `list_component_documents` — documents for a component
- `get_component_document` — single document by ID
- `list_print_queues` — print queues available to the token (`limit` default 50, max 200)
- `list_print_queue_items` — items in a queue (`print_list_id` optional; uses default queue)
- `list_purchase_requests` / `get_purchase_request` — purchase requests (filter by `assigned`, component, purchase)
- `list_purchases` / `get_purchase` — supplier orders, with items, deliveries and attached requests
- `get_purchase_export_csv` — supplier import CSV (Mouser style) for a purchase

Production BOM tools (`nextintranet_production`) are registered on the same server:
`list_boms`, `get_bom`, `get_bom_availability`, `list_productions`, `get_production` (read) and
`update_bom`, `set_bom_line_component`, `lock_bom`, `finalize_bom` (write).

### Write (`mcp:write` scope, includes all read tools)

- `update_component_description` — update a component's description (alias for description-only updates)
- `update_component` — update name, description, category, tags, selling/internal prices
- `set_component_parameters` — set/update component parameters
- `create_component` — create a new component (do not put URLs in description; use documents instead)
- `create_component_document` — attach a URL document (`is_primary` for image thumbnails; image URLs must be direct file links)
- `update_component_document` — update name, URL, type, or `is_primary`
- `set_component_primary_document` — set an existing image as primary
- `delete_component_document` — remove document from component
- `create_packet` / `update_packet` / `add_packet_stock_operation` — packets and stock quantity changes
- `create_parameter_type` / `update_parameter_type` / `delete_parameter_type` — parameter types
- `create_category` / `update_category` / `delete_category` — categories
- `create_location` / `update_location` / `delete_location` — warehouse locations
- `create_supplier` / `update_supplier` / `delete_supplier` — suppliers
- `link_component_supplier` / `update_supplier_relation` / `delete_supplier_relation` — component–supplier links
- `create_reservation` / `update_reservation` / `delete_reservation` — reservations
- `create_print_queue` — create a queue owned by the token's user
- `add_to_print_queue` — add a component, packet, or location label to a queue
- `add_targets_to_print_queue` — add multiple labels in one call
- `remove_print_queue_item` — remove an item from a queue
- `create_purchase_request` / `update_purchase_request` / `delete_purchase_request` — purchase requests
- `assign_purchase_requests` — attach requests to a purchase
- `create_purchase` / `set_purchase_items` / `set_purchase_item_location` — build the order
- `transition_purchase` — move the order through its lifecycle
- `receive_purchase_items` / `stock_purchase_deliveries` / `complete_purchase` — receiving and stocking

## Purchases

The whole ordering flow is available over MCP, in this order:

1. `create_purchase_request` — file wishes as they come up.
2. `create_purchase` for a supplier, then `assign_purchase_requests` to cover the open wishes.
3. `set_purchase_items` — add lines (`component_id` or `supplier_relation_id`, `quantity`,
   `unit_price_original`, and **`stock_location_id`**). The stock location is assignable while
   the order is still being built; `set_purchase_item_location` changes a single line.
4. `transition_purchase` through `items_defined` → `priced` → `closed` → `exported`.
   **Exporting creates a draft packet** (state `expected`) for every component line at its stock
   location, so labels can be printed before the goods arrive. Every component line therefore
   needs a stock location before export, otherwise the transition is rejected.
5. `receive_purchase_items` — record what arrived. Partial deliveries are supported; call it
   repeatedly until the line is complete. Set `queue_labels` to enqueue packet labels.
6. `stock_purchase_deliveries` — book the goods into stock. The expected packets flip to
   `stocked`, and the purchase completes automatically once everything is delivered and stocked.
   Use `complete_purchase` for the receiving → completed shortcut when nothing needs stocking.

Expected packets carry no stock (`count` 0) and derive `is_active=false`, so they never show up
in inventory totals or location searches until they are stocked.

## Print queue

MCP can enqueue labels for **components**, **packets** (stock batches), and **warehouse locations** — the same targets as the intranet “Add to queue” actions.

- `target_type`: `component`, `packet`, or `location`
- `target_id`: UUID of the target (`location` also accepts the legacy location `uuid` field)
- `print_list_id`: optional; omit to use the token owner’s default queue
- `kind`: `label` (default) or `document`

Tokens created in **Settings → Software → Generate MCP config** use the creating user’s queues (including public queues). Service tokens with `allowed_print_lists` configured are limited to those queues (same as print render).

`create_print_queue` makes a new queue owned by the token’s user (so the token must be linked to
one). When the token is restricted via `allowed_print_lists`, the new queue is added to that list
so the token can immediately use it.

## Component documents

Use `create_component_document` (or `update_component_document`) to attach links to a component.
Do not put URLs in the component `description` field.

| `doc_type` | Typical `url` |
|------------|----------------|
| `product_page`, `datasheet`, `manual`, … | Link to a web page (HTML) |
| `image` | **Direct link to the image file** (e.g. `https://cdn.example.com/part.jpg`) |

For **`doc_type` `image`** (including primary / thumbnail via `is_primary`):

- The `url` must point at the **image file itself** (`.jpg`, `.png`, `.webp`, etc.), not at an HTML product page or gallery.
- Wrong: product detail page where the image is embedded in HTML.
- Right: CDN or supplier URL that returns `Content-Type: image/*` when opened.

The first `image` document on a component is set as primary automatically; use `is_primary=true` or `set_component_primary_document` for later images.

## Architecture

- Backend: `django-mcp-server` library, toolsets in `nextintranet_warehouse/mcp_tools.py`
- Auth: ServiceToken with `mcp:read` / `mcp:write` scopes via `X-Service-Token` header (or the `X-Application-Key` alias)
- Nginx proxies `/mcp` to the Django container with SSE buffering disabled

See also [Service tokens](service-tokens.md) for token mechanics shared with printers and other integrations.
