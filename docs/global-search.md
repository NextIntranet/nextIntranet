# Global Search

Endpoint: `GET /api/v1/search/` (also accepts `POST` with the same parameters).

## Query parameters
- `q`: required search string or scanned code.
- `context`: optional context hint (`store`, `purchases`, `production`).
- `source`: optional filter (`components`, `locations`, `packets`, `purchases`, `productions`).
- `limit`: optional max results (1-25).

## Source filters
You can add a filter in the query string using the syntax:

- `source:store <value>`
- `source:orders <value>`
- `source:productions <value>`

Aliases supported: `store`, `warehouse`, `component(s)`, `location(s)`, `packet(s)`, `purchase(s)`, `order(s)`, `production(s)`, `all`.

## Barcode payloads
If the scanned value includes a query string, the handler will resolve supported keys:

- `component=<uuid>`
- `packet=<uuid>`
- `location=<uuid>`
- `purchase=<uuid>` (alias: `order`)

## Defaults
- No context: search across all sources.
- `context=store`: search components only.
- `context=purchases`: search orders only.
- `context=production`: search productions only.
