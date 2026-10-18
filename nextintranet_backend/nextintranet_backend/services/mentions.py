"""Mentions inside note markdown.

Canonical form is a plain markdown link, so the text stays readable anywhere:
    [@Jan Novák](mention:user/42)
    [#ESP32-C3](mention:component/<uuid>)
A shorthand `[[packet:<uuid>]]` is accepted as well; the frontend resolves its label.
"""
import re

MENTION_LINK_RE = re.compile(r"\[([^\]\n]*)\]\(mention:([a-z_]+)/([A-Za-z0-9_\-]+)\)")
MENTION_SHORT_RE = re.compile(r"\[\[([a-z_]+):([A-Za-z0-9_\-]+)\]\]")

MENTION_KINDS = frozenset({'user', 'component', 'packet', 'location', 'production', 'template', 'purchase'})


def parse_mentions(body: str) -> list[tuple[str, str]]:
    """Ordered, de-duplicated `(kind, target_id)` pairs referenced by `body`."""
    found: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    text = body or ''
    matches = [(m.start(), m.group(2), m.group(3)) for m in MENTION_LINK_RE.finditer(text)]
    matches += [(m.start(), m.group(1), m.group(2)) for m in MENTION_SHORT_RE.finditer(text)]
    for _, kind, target_id in sorted(matches):
        if kind not in MENTION_KINDS:
            continue
        pair = (kind, target_id)
        if pair not in seen:
            seen.add(pair)
            found.append(pair)
    return found


def mention_labels(body: str) -> dict[tuple[str, str], str]:
    """Label text of each canonical mention link (`@Jan Novák` → `Jan Novák`)."""
    labels = {}
    for match in MENTION_LINK_RE.finditer(body or ''):
        labels.setdefault((match.group(2), match.group(3)), match.group(1).lstrip('@#'))
    return labels


def plain_text(body: str) -> str:
    """Body with mention links collapsed to their labels — for PDFs and other plain renderers."""
    text = MENTION_LINK_RE.sub(lambda m: m.group(1), body or '')
    return MENTION_SHORT_RE.sub(lambda m: f"{m.group(1)}:{m.group(2)[:8]}", text)
