# KiBot assets

`ibom_user.js` is a **symlink** to
`nextintranet_backend/nextintranet_production/ibom_bridge_js/ni_bridge.js` — the same script the
backend injects into uploaded iBOM files (`ibom_bridge.py`). Edit the source there, never this copy.

Point KiBot's InteractiveHtmlBom output at it so generated boards ship with the bridge already in
place; boards uploaded to NextIntranet get it injected regardless.
