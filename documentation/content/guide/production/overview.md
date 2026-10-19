---
title: Production overview
description: The Overview tab of a BOM series — statistics, material cost, source files, photos, notes and PDF exports.
---

# Production overview

Opening a BOM series (`/production/bom/<id>`) lands on the **Overview** tab, next to
**BOM**, **Production** and **Finalize & Lock**.

## Statistics

| Card | Meaning |
|---|---|
| Component types | Distinct linked warehouse components (DNP and BOM-excluded lines are left out). |
| Parts per board | Sum of `qty_per_board`; the detail line shows the total for the planned quantity. |
| Material / board, Material total | Estimated cost. Unit price comes from the stock value of active packets, then the component's internal price, then the last purchase price. |
| Consumed from stock | Value of parts already booked out by placement scans. Returned placements are not counted. |
| Footprints | Distinct footprints and the top/bottom/both split. |

Below the cards you can see sourcing and placement progress, the availability status of
each line in the BOM's warehouse, and a warning that lists lines without a known price.
The material cost is underestimated while that warning is shown.

## Source files

These are the files the series was built from: the imported KiCad netlist (XML), its
source URL and SHA-256, and the interactive BOM (iBOM). Click a file to download or open it.

## Photos & files

Upload production photos, test reports or any other files with **Upload photos / files**,
or drop them on the card. Images appear as thumbnails and open in a viewer, where the
arrow keys switch between photos. You can add a caption to any file. Only the uploader
or a superuser can delete a file.

## Notes

Notes are Markdown messages with an author and a time. They are a shared system:
the same notes can later be enabled on components, packets and other objects.

- Type `@` to mention a user and `#` to mention a component. Pick from the list with
  the arrow keys and Enter.
- Other objects can be referenced with the shorthand `[[packet:<id>]]`. The same works
  for `location`, `production`, `template` and `purchase`.
- Use the paperclip to attach files to a note.
- Only the author can edit a note. The author or a superuser can delete it.
- Press **Ctrl+Enter** to submit.

Mentions are stored as ordinary Markdown links, such as `[@Jan Novák](mention:user/42)`,
so the text stays readable when it is exported.

## PDF exports

Each tab can export a PDF report:

| Tab | Export | Content |
|---|---|---|
| Overview | Export PDF | Header, statistics, source files, attachments, description and notes |
| BOM | BOM PDF | All lines, including DNP and excluded lines (shown greyed out) |
| BOM / Production | Sourcing list PDF | Every line with its warehouse locations and a suggested pick quantity, plus a pick route grouped by location |
| Production | Progress PDF | Needed, sourced, placed and remaining quantity per line |
| Finalize & Lock | Finalization PDF | Needed, placed and deducted quantity per line, with incomplete lines highlighted |

The sourcing list takes from your home warehouse first (marked ★), then from the fullest
packets.

## Editing a locked series

When a series is locked or finished, the **BOM detail** panel shows a warning. Production
administrators (`production` area at level `admin`, or superusers) can still change the
name, description and planned date. They must confirm the change, and it is logged as a note.
Everyone else sees the fields read-only.
