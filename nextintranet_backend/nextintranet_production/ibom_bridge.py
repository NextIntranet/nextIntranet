"""
Utilities for injecting the NextIntranet WebSocket bridge into iBOM HTML files.
"""
import re
from io import BytesIO
from pathlib import Path

from django.core.files.uploadedfile import InMemoryUploadedFile

# HTML comment markers wrapping the injected block. Used to find & replace an
# existing injection so re-uploading always gets the latest bridge.
_BLOCK_START = "<!-- NI-BRIDGE-START -->"
_BLOCK_END = "<!-- NI-BRIDGE-END -->"

# Sentinel present in the bridge JS — used to strip legacy injections that
# predate the comment markers.
_DETECTION_MARKER = "window.NIBridgeDebug"

# Removes the marker-wrapped block (current format).
_BLOCK_RE = re.compile(
    re.escape(_BLOCK_START) + r".*?" + re.escape(_BLOCK_END) + r"\s*",
    re.DOTALL,
)

# Removes a legacy <script> block that contains the sentinel but no markers.
_LEGACY_RE = re.compile(
    r"<script\b[^>]*>(?:(?!</script>).)*?" + re.escape(_DETECTION_MARKER) + r"(?:(?!</script>).)*?</script>\s*",
    re.DOTALL,
)

# The injected JS lives in its own file so it can be edited with editor support and
# shared verbatim with the KiBot user-js copy (assets/kibot/ibom_user.js is a symlink
# to it). Read once at import — it is a source file, it does not change at runtime.
_JS_PATH = Path(__file__).resolve().parent / "ibom_bridge_js" / "ni_bridge.js"
_NI_BRIDGE_JS = _JS_PATH.read_text(encoding="utf-8")


def strip_ni_bridge(html: str) -> str:
    """Remove any previously injected NI bridge block (current or legacy)."""
    html = _BLOCK_RE.sub("", html)
    if _DETECTION_MARKER in html:
        html = _LEGACY_RE.sub("", html)
    return html


def inject_ni_bridge(html: str) -> str:
    """Return html with the latest NI bridge block injected before </body>.

    Any existing injection (marker-wrapped or legacy) is removed first, so the
    result always carries the current bridge — re-uploading updates it in place.
    """
    html = strip_ni_bridge(html)
    block = (
        _BLOCK_START + "\n"
        + '<script type="text/javascript">\n' + _NI_BRIDGE_JS + "</script>\n"
        + _BLOCK_END + "\n"
    )
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    # No </body> (unusual for iBOM) — append so the bridge still loads.
    return html + block


def inject_ni_bridge_into_upload(upload_file) -> InMemoryUploadedFile:
    """Read an UploadedFile, inject the NI bridge, return an InMemoryUploadedFile.

    Any existing bridge is replaced with the latest version.
    The caller is responsible for assigning the result to the model field.
    """
    raw = upload_file.read().decode("utf-8", errors="replace")
    patched = inject_ni_bridge(raw)
    data = patched.encode("utf-8")
    return InMemoryUploadedFile(
        file=BytesIO(data),
        field_name="ibom_file",
        name=upload_file.name,
        content_type="text/html",
        size=len(data),
        charset="utf-8",
    )
