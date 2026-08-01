---
title: Put-away check
description: Scan a bag and a shelf to check whether the bag belongs there.
---

# Put-away check

When you put components back into the warehouse, the put-away check tells you in
one glance whether the bag in your hand belongs on the shelf in front of you.

The page is read-only. It never moves a packet and never changes stock — it only
compares the packet's stored location with the location you scanned.

## Modes

**Bag + shelf** — scan a bag label and a shelf label, in either order. As soon as
both are known you get a verdict and both slots clear, ready for the next pair.

**Fixed shelf** — pick a shelf from the tree or scan its label once. The shelf stays
selected, so you can scan one bag after another and get an instant verdict for each.
Scanning another shelf label switches the selection.

## Verdicts

| Verdict | Meaning |
|---|---|
| **Belongs here** (green) | The bag's stored location is the scanned shelf. |
| **Does not belong** (red) | The bag belongs elsewhere. The correct location is shown below the verdict, so you can carry the bag there. |
| **No location assigned** (amber) | The bag has no location in the system yet. Assign one on the packet detail page. |

Two extra warnings can appear under a verdict:

- The bag is not in the *Stocked* state (for example *Expected* or *Retired*), so it
  should not be shelved as stock.
- The scanned location is not marked as able to store items.

## Scanning

All three input paths work on this page:

- **Hardware scanner** — any scanner connected through the hardware agent or a
  browser serial port (see *Settings → Hardware*). While the put-away page is open,
  scans are handled by the page instead of navigating to the packet detail page.
- **Camera** — press *Camera* to scan with a phone or webcam. The camera stays open
  between scans so a whole shelf can be checked in one go.
- **Manual entry** — type or paste a code into the input and press Enter. This also
  covers keyboard-wedge scanners.

Both current and older label formats are recognised, for bags as well as shelves.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `s` | Focus the scan input |
| `m` | Switch between *Bag + shelf* and *Fixed shelf* |

## Permissions

Requires at least **read** access to the *warehouse* area.
