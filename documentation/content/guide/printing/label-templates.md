---
title: Label templates
description: Design what a printed label looks like, per target type and paper format.
---

# Label templates

A **label template** defines the layout rendered for a component, packet, or
location label. Manage templates at **Settings → Label templates**
(`/settings/label-template`) — this page requires staff/superuser access.

## Definition

A template's `definition` is a small JSON document:

```json
{
  "version": 1,
  "canvas": { "width_mm": 66.04, "height_mm": 38.1 },
  "elements": [
    { "id": "title", "type": "text", "x": 2, "y": 2, "w": 62, "h": 6,
      "content": "New label", "font_size": 12, "bold": true }
  ]
}
```

- `canvas` — physical label size in millimeters.
- `elements` — an ordered list of `text`, `barcode`, `logo`, `line`, or `rect`
  elements, each positioned in millimeters (`x`, `y`, `w`, `h`) from the top-left
  corner.

You can edit a template either visually, with the drag-and-drop **label designer**,
or by switching to the raw **JSON** view — both edit the same `definition`.

## Template fields

- `name`
- `label_type` — which kind of object the template applies to: `packet`,
  `location`, or `component`.
- `enabled` — disabled templates are hidden from selection but not deleted.
- `is_default` — the template used when none is explicitly chosen for a
  `label_type`.
- `supported_formats` — which [print queue formats](print-queues.md#formats) (e.g.
  `single`, `a4_2x7`) this template can render into.

## Preview

The editor renders a live PDF preview of the current (possibly unsaved) definition,
so you can check spacing and content placement before saving.

## Related topics

- [Print queues](print-queues.md) — where a label actually gets queued and rendered
- [Plugin system → Printing restrictions](../../developer/plugin-system.md#printing-restrictions) —
  how a printer driver plugin further restricts which templates/formats it accepts
