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
- `add_to_print_queue` — add a component, packet, or location label to a queue
- `add_targets_to_print_queue` — add multiple labels in one call
- `remove_print_queue_item` — remove an item from a queue

## Print queue

MCP can enqueue labels for **components**, **packets** (stock batches), and **warehouse locations** — the same targets as the intranet “Add to queue” actions.

- `target_type`: `component`, `packet`, or `location`
- `target_id`: UUID of the target (`location` also accepts the legacy location `uuid` field)
- `print_list_id`: optional; omit to use the token owner’s default queue
- `kind`: `label` (default) or `document`

Tokens created in **Settings → Software → Generate MCP config** use the creating user’s queues (including public queues). Service tokens with `allowed_print_lists` configured are limited to those queues (same as print render).

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
- Auth: ServiceToken with `mcp:read` / `mcp:write` scopes via `X-Service-Token` header
- Nginx proxies `/mcp` to the Django container with SSE buffering disabled

See also [Service tokens](service-tokens.md) for token mechanics shared with printers and other integrations.
