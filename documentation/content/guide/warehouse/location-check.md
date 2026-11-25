---
title: Location check
description: Compare what is physically stored in a location with what the warehouse expects there.
---

# Location check

The location check verifies one location at a time: you scan everything that is
physically there and the page sorts it against what the warehouse expects.

Open it from **Warehouse → Location check**, or with the *Location check* button
next to a location in the [Locations](locations.md) list and in the location detail.

## Columns

| Column | Contents |
|---|---|
| **Not found yet** (amber) | Active packets the warehouse expects in the location that you have not scanned yet. Whatever is left here at the end is missing. |
| **Confirmed** (green) | Expected packets you scanned or marked as found. |
| **Does not belong here** (red) | Packets you scanned that are stored in a different location, or have no location. |

The strip above the columns shows the result of the last scan in large type, so you
do not need to read the lists while scanning, together with the running progress.
When nothing is left in the amber and red columns, the location is verified.

For a location with sub-locations, **Include sub-locations** decides whether packets
stored deeper in the tree count as expected. Turn it off to check only packets stored
directly in the selected location.

## Adding packets

- **Scan** a packet label with a hardware scanner, the camera, or by typing the code
  into the scan input and pressing Enter.
- **Pick from the list** — press the check mark next to a packet in *Not found yet*
  to mark it as found without scanning. Long lists get a filter box.

Scanning a location label switches the check to that location.

## Resolving packets that do not belong

Each packet in the red column has three actions:

- **Move to this location** — changes the packet's stored location to the checked
  one. Needs **write** access and a location that can store items.
- **Open home location** — shows where the packet is supposed to be.
- **Remove from list** — use after carrying the packet back to its own location.

## Resolving missing packets

With **write** access, the **⋯** menu next to a packet in *Not found yet* offers:

- **Found elsewhere — move…** — pick the location where the packet actually is.
- **Lost — retire packet…** — marks the packet as *Retired*, so it no longer counts
  as usable stock. It can be reactivated on the packet detail page.

## Saving the check

**Save check** stores the result — who checked the location, when, and which packets
were confirmed, missing and unexpected at that moment. Saved checks are listed under
**Previous checks** below the columns; open a row with problems to see the packets.
A saved check is a snapshot and does not change when packets are moved or retired
later, so save first and resolve afterwards if you want the record to show what you
found. Saved checks cannot be edited.

Until you save, progress is kept only in the browser tab: reloading the page keeps
it, and **Start over** clears it. Saving does not change stock quantities — to record
counted quantities, use [Inventory](inventory.md).

## Keyboard shortcuts

| Key | Action |
|---|---|
| `s` | Focus the scan input |

## Permissions

Requires at least **read** access to the *warehouse* area; moving packets requires
**write**.

## Related topics

- [Put-away check](put-away.md) — quick one-packet check without a list
- [Inventory](inventory.md) — counting quantities during a stocktaking campaign
