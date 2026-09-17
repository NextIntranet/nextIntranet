---
title: Print queues
description: Queue labels and documents for printing, and render them as PDFs.
---

# Print queues

A **print queue** (`PrintList`) is a named list of things waiting to be printed —
labels for components, packets, or locations, or arbitrary uploaded documents. Manage
queues at **Print → Queue** (`/print/queue`).

## Queues

- `owner` — the user who created the queue.
- `is_public` — public queues (the default) are visible to everyone; private ones
  only to their owner and anyone in `shared_with`.
- `is_default` — a user's default queue is the target when adding a label without
  picking one explicitly (e.g. from the MCP tools or a quick "print" action).

## Adding items

An item (`PrintItem`) targets a **component**, **packet**, or **location** and is
either a `label` or a `document`:

- The intranet's "add to print queue" actions on component/packet/location pages
  create `label` items.
- Uploading a file directly to a queue creates a `document` item.

Items start in `queued` status and move through `printing` → `printed`, or `failed`
if rendering fails.

## Rendering

`POST /api/v1/print/render/` creates a `PrintRenderJob` for a queue (or a specific
set of items) and dispatches it asynchronously via the background worker
(django-q) — the request returns immediately with a `queued` job, so it's safe to
call for large batches. The worker renders every item to a single PDF (via
`fpdf2`) and attaches the result as a downloadable file once the job reaches
`ready` (or `failed`, with an error message, if something went wrong). Rendered
files expire automatically after a configured TTL.

Both signed-in users and [service tokens](../settings/service-tokens.md) can call
the render endpoint — a service token needs the `print:render` scope and can only
render from queues listed in its `allowed_print_lists`.

### Formats

A render job picks a **format**, which controls the sheet layout: `single` (one
label per output), or a full-sheet layout like `a4_2x7`, `a4_3x7`, `a4_4x10` for
printing many labels on a single A4 page of pre-cut label stock.

## Automation

The whole flow — adding items and rendering — is available over MCP:
`add_to_print_queue`, `add_targets_to_print_queue` (batch), `remove_print_queue_item`,
`create_print_queue`, `list_print_queues`, `list_print_queue_items`. See
[MCP integration → Print queue](../settings/mcp.md#print-queue).

## Related topics

- [Label templates](label-templates.md) — what a label actually looks like
- [Service tokens](../settings/service-tokens.md) — scoping render access for
  unattended printers
- [Hardware](../settings/hardware.md) — sending a rendered PDF (or a raw payload) to
  a physical printer
