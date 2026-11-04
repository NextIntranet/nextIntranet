"""Downloadable PDF reports for one BOM series (Template), one per page tab."""
import re

from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from nextintranet_backend.reports.pdf import Column, ReportPDF, Row, fmt_datetime, fmt_money, fmt_qty
from nextintranet_backend.services.mentions import plain_text

from .models.production import Template
from .services.bom import bom_availability_rows, line_deducted_total, line_needed_total, safe_float
from .services.summary import template_summary

EXPORT_KINDS = ("overview", "bom", "sourcing", "production", "finalize")

STATUS_LABELS = {
    "draft": "Draft",
    "in_progress": "In progress",
    "locked": "Locked",
    "finished": "Finished",
}
AVAILABILITY_LABELS = {
    "ok": "OK",
    "incoming": "Incoming",
    "elsewhere": "Other warehouse",
    "missing": "Missing",
    "unlinked": "Unlinked",
}


def export_filename(template: Template, kind: str) -> str:
    base = slugify(f"{template.production.name}-{template.name}") or str(template.id)
    return f"{base}-{kind}.pdf"


def _subtitle(template: Template) -> str:
    return f"{template.production.name} / {template.name}"


def _lines(template: Template, include_inactive: bool = False):
    lines = template.components.select_related("component").order_by("position", "id")
    if not include_inactive:
        lines = lines.filter(dnp=False, exclude_from_bom=False)
    return list(lines)


def _line_label(line) -> str:
    return line.component.name if line.component else "Unlinked"


def _header_block(pdf: ReportPDF, template: Template):
    pdf.key_values(
        [
            ("Product", template.production.name),
            ("Series", template.name),
            ("Status", STATUS_LABELS.get(template.status, template.status)),
            ("Planned qty", f"{template.qty_planned}×"),
            ("Planned date", fmt_datetime(template.planned_date)),
            ("Warehouse", template.stock_warehouse.full_path if template.stock_warehouse else "-"),
            ("Locked", fmt_datetime(template.locked_at)),
            ("Locked by", template.locked_by.get_username() if template.locked_by else "-"),
        ]
    )


def build_overview(template: Template, home_location_ids=None, warehouse_id=None) -> ReportPDF:
    from nextintranet_backend.models import Attachment, Note

    summary = template_summary(template, home_location_ids, warehouse_id)
    pdf = ReportPDF("Production overview", _subtitle(template))
    _header_block(pdf, template)

    parts, cost, progress = summary["parts"], summary["cost"], summary["progress"]
    pdf.section("Statistics")
    pdf.key_values(
        [
            ("BOM lines", str(parts["active_lines"])),
            ("Component types", str(parts["component_types"])),
            ("Parts per board", fmt_qty(parts["parts_per_board"])),
            ("Parts total", fmt_qty(parts["parts_total"])),
            ("Unlinked lines", str(parts["unlinked_lines"])),
            ("DNP lines", str(parts["dnp_lines"])),
            ("Footprints", str(parts["footprints"])),
            ("Needs review", str(parts["needs_review_lines"])),
            ("Material / board", fmt_money(cost["per_board"])),
            ("Material total", fmt_money(cost["total"])),
            ("Price coverage", f"{cost['coverage'] * 100:.0f} %"),
            ("Consumed from stock", fmt_money(cost["consumed"])),
            ("Sourced", f"{fmt_qty(progress['sourced'])} / {fmt_qty(progress['needed'])}"),
            ("Placed", f"{fmt_qty(progress['placed'])} / {fmt_qty(progress['needed'])}"),
        ]
    )
    if summary["availability"]:
        pdf.key_values(
            [(AVAILABILITY_LABELS.get(key, key), str(value)) for key, value in sorted(summary["availability"].items())],
            columns=3,
        )

    files = summary["files"]
    pdf.section("Source files")
    pdf.key_values(
        [
            ("Netlist (XML)", files["source_file_name"] or "-"),
            ("Imported", fmt_datetime(files["source_imported_at"])),
            ("Source URL", files["source_url"] or "-"),
            ("SHA-256", (files["source_hash"] or "-")[:24]),
            ("iBOM", files["ibom_file_name"] or files["ibom_url"] or "-"),
            ("iBOM updated", fmt_datetime(files["ibom_updated_at"])),
        ]
    )

    content_type = ContentType.objects.get_for_model(Template)
    attachments = list(
        Attachment.objects.filter(content_type=content_type, object_id=str(template.id), note__isnull=True)
        .select_related("uploaded_by")
        .order_by("created_at")
    )
    if attachments:
        pdf.section("Attachments")
        pdf.table(
            [Column("File", 90), Column("Kind", 22), Column("Caption", 46), Column("Uploaded", 28)],
            [
                Row([a.original_name, a.kind, a.caption, fmt_datetime(a.created_at)])
                for a in attachments
            ],
        )

    if template.description:
        pdf.section("Description")
        pdf.paragraph(_markdown_to_text(template.description))

    notes = list(
        Note.objects.filter(content_type=content_type, object_id=str(template.id))
        .select_related("author")
        .prefetch_related("attachments")
        .order_by("created_at")
    )
    if notes:
        pdf.section("Notes")
        for note in notes:
            author = note.author.get_full_name() or note.author.get_username() if note.author else "Unknown"
            pdf.ensure_space(12)
            pdf.set_font("DejaVuSans", "B", 8)
            pdf.set_text_color(90)
            edited = " (edited)" if note.edited_at else ""
            pdf.cell(0, 5, f"{author} · {fmt_datetime(note.created_at)}{edited}", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0)
            pdf.paragraph(_markdown_to_text(plain_text(note.body)), size=8.5)
            names = [a.original_name for a in note.attachments.all()]
            if names:
                pdf.muted("Attachments: " + ", ".join(names))
            pdf.ln(1.5)
    return pdf


def build_bom(template: Template) -> ReportPDF:
    pdf = ReportPDF("Bill of materials", _subtitle(template))
    _header_block(pdf, template)
    pdf.section("Lines")
    rows = []
    for line in _lines(template, include_inactive=True):
        flags = " ".join(flag for flag, on in (("DNP", line.dnp), ("excluded", line.exclude_from_bom)) if on)
        rows.append(
            Row(
                [
                    line.ref_group or "-",
                    line.value or "-",
                    line.footprint or "-",
                    _line_label(line),
                    fmt_qty(line.qty_per_board),
                    fmt_qty(line_needed_total(line, template.qty_planned)),
                    flags,
                ],
                muted=line.dnp or line.exclude_from_bom,
            )
        )
    pdf.table(
        [
            Column("Ref", 34),
            Column("Value", 28),
            Column("Footprint", 36),
            Column("Component", 44),
            Column("/board", 12, "R"),
            Column("Total", 13, "R"),
            Column("", 19),
        ],
        rows,
    )
    return pdf


def _allocate(remaining: float, locations: list[dict]) -> list[tuple[dict, float]]:
    """Greedy pick plan: home-warehouse locations first, then the largest packets."""
    plan = []
    ordered = sorted(locations, key=lambda loc: (not loc.get("in_home"), -safe_float(loc.get("quantity"))))
    for location in ordered:
        take = min(remaining, safe_float(location.get("quantity")))
        plan.append((location, take if take > 0 else 0.0))
        remaining -= max(take, 0)
    return plan


def build_sourcing(template: Template, home_location_ids=None, warehouse_id=None) -> ReportPDF:
    pdf = ReportPDF("Sourcing list", _subtitle(template))
    _header_block(pdf, template)
    pdf.muted(
        "Suggested pick quantities prefer your home warehouse, then the fullest packets. "
        "Lines already placed only list the remaining quantity."
    )

    rows = [
        row
        for row in bom_availability_rows(template, home_location_ids, warehouse_id)
        if not row["dnp"] and not row["exclude_from_bom"]
    ]

    by_location: dict[str, list[tuple[dict, dict, float]]] = {}
    table_rows = []
    for row in rows:
        plan = _allocate(row["remaining"], row["locations"])
        sub = []
        for location, take in plan:
            pick = f"take {fmt_qty(take)}" if take > 0 else ""
            home = " ★" if location.get("in_home") else ""
            sub.append(
                f"{location['location']}{home} — {fmt_qty(location['quantity'])} pcs"
                f" (packet {location['packet_id'][:8]}) {pick}".rstrip()
            )
            if take > 0:
                by_location.setdefault(location["location"], []).append((row, location, take))
        if not row["locations"]:
            sub.append("No stock in any location.")
        table_rows.append(
            Row(
                [
                    "",
                    row["ref_group"] or "-",
                    row["linked_component_name"] or "Unlinked",
                    row["value"] or "-",
                    fmt_qty(row["needed_total"]),
                    fmt_qty(row["remaining"]),
                    AVAILABILITY_LABELS.get(row["status"], row["status"]),
                ],
                sub=sub,
                checkbox=True,
                muted=row["remaining"] <= 0,
            )
        )

    pdf.section("By component")
    pdf.table(
        [
            Column("", 7),
            Column("Ref", 34),
            Column("Component", 54),
            Column("Value", 30),
            Column("Need", 15, "R"),
            Column("Left", 15, "R"),
            Column("Stock", 31),
        ],
        table_rows,
    )

    pdf.section("Pick route (by location)")
    route_rows = []
    for location in sorted(by_location):
        route_rows.append(Row([location, "", "", ""], bold=True))
        for row, loc, take in by_location[location]:
            route_rows.append(
                Row(
                    ["", row["linked_component_name"] or "-", loc["packet_id"][:8], fmt_qty(take)],
                    checkbox=False,
                )
            )
    pdf.table(
        [Column("Location", 66), Column("Component", 78), Column("Packet", 20, "L"), Column("Take", 22, "R")],
        route_rows,
        empty_text="Nothing left to pick.",
    )
    return pdf


def build_production(template: Template) -> ReportPDF:
    pdf = ReportPDF("Production progress", _subtitle(template))
    _header_block(pdf, template)
    pdf.section("Lines")
    rows = []
    totals = [0.0, 0.0, 0.0]
    for line in _lines(template):
        needed = float(line_needed_total(line, template.qty_planned))
        sourced, placed = safe_float(line.sourced_total), safe_float(line.placed_total)
        totals[0] += needed
        totals[1] += sourced
        totals[2] += placed
        rows.append(
            Row(
                [
                    "",
                    line.ref_group or "-",
                    _line_label(line),
                    fmt_qty(needed),
                    fmt_qty(sourced),
                    fmt_qty(placed),
                    fmt_qty(max(0.0, needed - placed)),
                ],
                checkbox=True,
                muted=placed >= needed > 0,
            )
        )
    rows.append(Row(["", "Total", "", *(fmt_qty(v) for v in totals), fmt_qty(max(0.0, totals[0] - totals[2]))], bold=True))
    pdf.table(
        [
            Column("", 7),
            Column("Ref", 44),
            Column("Component", 61),
            Column("Need", 17, "R"),
            Column("Sourced", 17, "R"),
            Column("Placed", 17, "R"),
            Column("Left", 23, "R"),
        ],
        rows,
    )
    return pdf


def build_finalize(template: Template) -> ReportPDF:
    pdf = ReportPDF("Finalization report", _subtitle(template))
    _header_block(pdf, template)
    rows = []
    incomplete = 0
    lines = (
        template.components.select_related("component")
        .prefetch_related("scans__stock_operation")
        .filter(dnp=False)
        .order_by("position", "id")
    )
    for line in lines:
        needed = float(line_needed_total(line, template.qty_planned))
        placed = safe_float(line.placed_total)
        deducted = line_deducted_total(line)
        ok = placed >= needed
        incomplete += 0 if ok else 1
        rows.append(
            Row(
                [
                    line.ref_group or "-",
                    _line_label(line),
                    fmt_qty(needed),
                    fmt_qty(placed),
                    fmt_qty(deducted),
                    "OK" if ok else "Incomplete",
                ],
                bold=not ok,
            )
        )
    pdf.section("Summary")
    pdf.key_values(
        [
            ("Lines", str(len(rows))),
            ("Not fully placed", str(incomplete)),
        ]
    )
    pdf.section("Lines")
    pdf.table(
        [
            Column("Ref", 44),
            Column("Component", 62),
            Column("Need", 18, "R"),
            Column("Placed", 18, "R"),
            Column("Deducted", 20, "R"),
            Column("State", 24),
        ],
        rows,
    )
    return pdf


_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_MD_MARKERS_RE = re.compile(r"(\*\*|__|`|^#{1,6}\s+)", re.MULTILINE)


def _markdown_to_text(text: str) -> str:
    """Rough markdown → plain text for PDFs: keep link labels, drop emphasis/heading markers."""
    return _MD_MARKERS_RE.sub("", _MD_LINK_RE.sub(lambda m: m.group(1), text or ""))
