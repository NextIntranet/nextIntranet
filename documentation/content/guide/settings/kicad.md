---
title: KiCad HTTP library
description: Pull warehouse components into KiCad as a live symbol library.
---

# KiCad HTTP library

NextIntranet can act as a live [KiCad HTTP library](https://docs.kicad.org/master/en/eeschema/eeschema.html),
letting KiCad browse warehouse categories and components as if they were a symbol
library — without exporting or syncing a static file.

## Generate the config file

1. Go to **Settings → Software**.
2. In **Generate KiCad config**, enter a name.
3. Download the generated `.kicad_httplib` file and add it to KiCad as an HTTP
   library.

Generating a config requires at least **read** access to the *warehouse* area (see
[Permissions & roles](permissions.md)). It creates a dedicated service token scoped
to KiCad access only, so the resulting file can be shared with a team without
handing out a general-purpose token.

## What KiCad sees

- **Categories** map to the library's categories.
- **Components** inside a category become parts, but only once they carry a
  component parameter literally named `kicad:symbol` — its value is used as the
  KiCad `symbolIdStr` (the symbol reference, e.g. `Device:R`). A component without
  this parameter simply doesn't show up in KiCad.
- Any other parameter named `kicad:<field>` is passed through as a KiCad field,
  with the `kicad:` prefix stripped.
- The component's primary `datasheet` document, if any, is exposed as the
  datasheet field.

## Config file contents

The served config (`GET /api/kicad/nextIntranet.kicad_httplib`) points KiCad at a
REST API rooted at `<SITE_URL>/api/kicad/`, so it works against whatever base URL
your instance is deployed at (`SITE_URL` in settings/`.env`) — no manual editing of
the file is needed when moving between environments, as long as the token stays
valid.

## Related topics

- [Components](../warehouse/components.md#kicad-symbol) — adding the `kicad:symbol`
  parameter to a component
- [Service tokens](service-tokens.md) — the underlying auth mechanism
