from decimal import Decimal
import hashlib
import re
import uuid
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from ..ibom_bridge import inject_ni_bridge_into_upload

from django.contrib.contenttypes.models import ContentType
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Max, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from fpdf import FPDF
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from nextintranet_production.models import (
    ProductionFolder,
    Production,
    Template,
    TemplateComponent,
    TemplateComponentRef,
    Realization,
    RealizationComponent,
    TemplateComponentScan,
)
from nextintranet_production.serializers import (
    ProductionFolderSerializer,
    ProductionFolderListSerializer,
    ProductionSerializer,
    ProductionListSerializer,
    TemplateSerializer,
    TemplateListSerializer,
    TemplateComponentSerializer,
    RealizationSerializer,
    RealizationListSerializer,
    RealizationComponentSerializer,
)
from nextintranet_backend.identifier_lookup import resolve_identifier_objects
from nextintranet_backend.iso15434 import parse_iso15434
from nextintranet_backend.models.printList import PrintFile, PrintItem, PrintList
from nextintranet_backend.models.userSettings import UserSetting
from nextintranet_warehouse.models.component import Component, Packet, StockOperation


UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)


class CustomPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 1000


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def _extract_fields(comp: ET.Element) -> dict[str, str]:
    fields: dict[str, str] = {}
    for field in comp.findall("./fields/field"):
        name = _normalize_text(field.get("name"))
        if not name:
            continue
        fields[name] = _normalize_text(field.text)
    return fields


def _extract_properties(comp: ET.Element) -> dict[str, str]:
    props: dict[str, str] = {}
    for prop in comp.findall("./property"):
        name = _normalize_text(prop.get("name"))
        if not name:
            continue
        props[name] = _normalize_text(prop.get("value"))
    return props


def _is_default_symbol_value(value_text: str, lib_part: str) -> bool:
    value = value_text.strip()
    part = lib_part.strip()
    if not value:
        return True
    if "_small" in value.lower():
        return True
    if part and value.lower() == part.lower():
        has_numeric_or_unit = any(ch.isdigit() for ch in value) or any(
            unit in value.lower() for unit in ["ohm", "uf", "nf", "pf", "mh", "uh", "khz", "mhz", "ghz", "v", "a", "w"]
        )
        if not has_numeric_or_unit:
            return True
    return False


def _canonical_description(comp: ET.Element, fields: dict[str, str]) -> str:
    description_text = _normalize_text(comp.findtext("description"))
    if description_text:
        return description_text

    for key in ["Description", "description"]:
        if _normalize_text(fields.get(key)):
            return _normalize_text(fields[key])

    libsource = comp.find("libsource")
    if libsource is not None:
        return _normalize_text(libsource.get("description"))
    return ""


def _canonical_value(comp: ET.Element, lib_part: str) -> tuple[str, bool]:
    value_text = _normalize_text(comp.findtext("value"))
    needs_review = _is_default_symbol_value(value_text, lib_part)
    if needs_review and lib_part:
        return lib_part, True
    return value_text or lib_part, needs_review


def _extract_component_id(fields: dict[str, str], props: dict[str, str]) -> str:
    keys = [
        "NIID",
        "INTRANET_ID",
        "UUID",
        "UST_ID",
        "UST_id",
        "component_id",
    ]
    for key in keys:
        value = _normalize_text(fields.get(key) or props.get(key))
        if value:
            return value
    return ""


def _resolve_component_from_netlist_id(value: str) -> Component | None:
    cleaned = _normalize_text(value)
    if not cleaned:
        return None

    try:
        parsed_uuid = uuid.UUID(cleaned)
    except (TypeError, ValueError):
        parsed_uuid = None

    if parsed_uuid:
        return Component.objects.filter(id=parsed_uuid).first()

    for obj in resolve_identifier_objects(cleaned):
        if isinstance(obj, Component):
            return obj
    return None


def _extract_shop(fields: dict[str, str], props: dict[str, str]) -> str:
    keys = ["SHOP", "Obchod", "Supplier", "supplier", "Vendor", "vendor"]
    for key in keys:
        value = _normalize_text(fields.get(key) or props.get(key))
        if value:
            return value
    return ""


def _element_to_dict(elem: ET.Element):
    has_children = len(elem) > 0
    has_attribs = len(elem.attrib) > 0
    has_text = bool(elem.text and elem.text.strip())

    if not has_children and not has_attribs and has_text:
        return elem.text.strip()

    result: dict[str, Any] = {}
    if has_attribs:
        result.update(elem.attrib)
    if has_text and not has_children:
        result["_text"] = elem.text.strip()

    for child in elem:
        child_dict = _element_to_dict(child)
        if child.tag in result:
            if not isinstance(result[child.tag], list):
                result[child.tag] = [result[child.tag]]
            result[child.tag].append(child_dict)
        else:
            result[child.tag] = child_dict
    return result


def _extract_tstamp(comp: ET.Element) -> str | None:
    """KiCad instance UUID/tstamp, stable across netlist updates."""
    for getter in (
        lambda: comp.findtext("tstamps"),
        lambda: comp.findtext("tstamp"),
        lambda: comp.get("tstamps"),
        lambda: comp.get("tstamp"),
    ):
        value = getter()
        if value:
            value = value.strip()
            if value:
                # tstamps can be space-separated; first entry is the component UUID.
                return value.split()[0]
    return None


def _parse_netlist_components(xml_bytes: bytes):
    root = ET.fromstring(xml_bytes)
    groups: dict[tuple[str, str, str, bool], dict[str, Any]] = {}

    for comp in root.findall(".//components/comp") or root.findall(".//comp"):
        ref = _normalize_text(comp.get("ref"))
        fields = _extract_fields(comp)
        props = _extract_properties(comp)

        dnp = any(name.lower() == "dnp" for name in props.keys())

        libsource = comp.find("libsource")
        lib_part = _normalize_text(libsource.get("part") if libsource is not None else "")
        display_value, needs_review = _canonical_value(comp, lib_part)
        description = _canonical_description(comp, fields)

        footprint = _normalize_text(comp.findtext("footprint"))
        datasheet = _normalize_text(comp.findtext("datasheet"))
        if datasheet == "~":
            datasheet = ""

        component_id = _extract_component_id(fields, props)
        linked_component = _resolve_component_from_netlist_id(component_id) if component_id else None

        group_key = (
            display_value,
            footprint,
            str(linked_component.id) if linked_component else "",
            dnp,
        )

        if group_key not in groups:
            groups[group_key] = {
                "refs": [],
                "value": display_value,
                "footprint": footprint,
                "datasheet": datasheet,
                "bom_description": description,
                "dnp": dnp,
                "needs_review": needs_review,
                "component": linked_component,
                "shop": _extract_shop(fields, props),
                "instances": [],
            }

        group = groups[group_key]
        if ref:
            group["refs"].append(ref)

        if not group.get("datasheet") and datasheet:
            group["datasheet"] = datasheet
        if not group.get("bom_description") and description:
            group["bom_description"] = description
        group["needs_review"] = bool(group.get("needs_review") or needs_review)
        group["instances"].append(
            {
                "ref": ref,
                "tstamp": _extract_tstamp(comp),
                "value": display_value,
                "footprint": footprint,
                "datasheet": datasheet,
                "description": description,
                "dnp": dnp,
                "fields": fields,
                "properties": props,
                "raw": _element_to_dict(comp),
            }
        )

    rows = []
    for group in groups.values():
        refs_sorted = sorted(group["refs"], key=lambda x: (x[:1], x))
        ref_group = ",".join(refs_sorted)
        qty_per_board = len(refs_sorted) if refs_sorted else 1
        snapshot = {
            "ref_group": ref_group,
            "refs": refs_sorted,
            "qty_per_board": qty_per_board,
            "value": group["value"],
            "footprint": group["footprint"],
            "datasheet": group["datasheet"],
            "bom_description": group["bom_description"],
            "dnp": group["dnp"],
        }
        rows.append(
            {
                "ref_group": ref_group,
                "refs": refs_sorted,
                "qty_per_board": qty_per_board,
                "value": group["value"],
                "footprint": group["footprint"],
                "datasheet": group["datasheet"],
                "bom_description": group["bom_description"],
                "dnp": group["dnp"],
                "needs_review": group["needs_review"],
                "component": group["component"],
                "source_type": "imported",
                "import_snapshot": snapshot,
                "attributes": {
                    "instances": group["instances"],
                    "shop": group.get("shop"),
                },
            }
        )

    rows.sort(key=lambda row: (row.get("footprint") or "", row.get("value") or "", row.get("ref_group") or ""))
    for idx, row in enumerate(rows):
        row["position"] = idx
    return rows


def _sha256_digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _extract_packet_id_from_barcode(barcode: str) -> str | None:
    cleaned = (barcode or "").strip().rstrip(";")
    if not cleaned:
        return None

    iso_scan = parse_iso15434(cleaned)
    if iso_scan and iso_scan.serial_number:
        try:
            return str(uuid.UUID(iso_scan.serial_number))
        except (TypeError, ValueError):
            pass

    if "packet=" in cleaned:
        query = cleaned
        if "?" in query:
            query = query.split("?", 1)[1]
        params = parse_qs(query)
        packet_value = params.get("packet", [None])[0]
        if packet_value:
            return packet_value

    match = re.search(r"/store/packet/([^/?#]+)", cleaned)
    if match:
        return match.group(1)

    direct = UUID_RE.search(cleaned)
    if direct:
        return direct.group(0)

    return None


def _resolve_barcode(barcode: str) -> dict[str, Any] | None:
    cleaned = (barcode or "").strip().rstrip(";")

    packet_id = _extract_packet_id_from_barcode(cleaned)
    if packet_id:
        packet = Packet.objects.filter(id=packet_id).select_related("component").first()
        if packet:
            return {
                "barcode": barcode,
                "packet": packet,
                "component": packet.component,
            }

    iso_scan = parse_iso15434(cleaned)
    lookup_values = []
    if iso_scan and iso_scan.serial_number:
        lookup_values.append(iso_scan.serial_number)
    if cleaned and cleaned not in lookup_values:
        lookup_values.append(cleaned)

    for value in lookup_values:
        for obj in resolve_identifier_objects(value):
            if isinstance(obj, Packet):
                return {
                    "barcode": barcode,
                    "packet": obj,
                    "component": obj.component,
                }
            if isinstance(obj, Component):
                return {
                    "barcode": barcode,
                    "packet": None,
                    "component": obj,
                }

    component_direct = Component.objects.filter(id=cleaned).first()
    if component_direct:
        return {
            "barcode": barcode,
            "packet": None,
            "component": component_direct,
        }

    return None


def _line_needed_total(line: TemplateComponent, qty_planned: int) -> Decimal:
    if line.qty_override_total is not None:
        return _safe_decimal(line.qty_override_total)
    return Decimal(line.qty_per_board or 0) * Decimal(qty_planned or 0)


def _line_locations(
    component: Component | None,
    home_location_ids: set | None = None,
) -> list[dict[str, Any]]:
    if not component:
        return []
    rows = []
    packets = (
        component.packets.select_related("location")
        .filter(is_active=True)
        .order_by("location__name", "id")
    )
    for packet in packets:
        count = _safe_float(packet.count)
        if count <= 0:
            continue
        rows.append(
            {
                "packet_id": str(packet.id),
                "location": packet.location.full_path if packet.location else "Unknown",
                "quantity": count,
                "in_home": bool(home_location_ids and packet.location_id in home_location_ids),
            }
        )
    return rows


def _recalculate_scan_totals(line: TemplateComponent) -> tuple[Decimal, Decimal]:
    sourced_only_total = line.scans.filter(mode="sourced").aggregate(total=Sum("qty")).get("total") or Decimal("0")
    placed_total = line.scans.filter(mode="placed").aggregate(total=Sum("qty")).get("total") or Decimal("0")

    # Placed parts are also sourced by definition.
    sourced_total = sourced_only_total + placed_total
    line.sourced_total = sourced_total
    line.placed_total = placed_total
    line.save(update_fields=["sourced_total", "placed_total"])
    return sourced_total, placed_total


def _consume_component(component: Component, qty: float, reference, user, description: str):
    remaining = float(qty)
    packets = (
        Packet.objects.filter(component=component, is_active=True, count__gt=0)
        .order_by("date_added", "id")
        .all()
    )

    for packet in packets:
        if remaining <= 0:
            break
        packet_count = _safe_float(packet.count)
        if packet_count <= 0:
            continue

        consume_qty = min(packet_count, remaining)
        StockOperation.objects.create(
            packet=packet,
            reference=reference,
            operation_type="remove",
            quantity=-float(consume_qty),
            relative_quantity=True,
            unit_price=packet.itemValue if packet.itemValue is not None else None,
            description=description,
            metadata={"production_id": str(reference)} if reference else {},
            author=user,
        )
        remaining -= consume_qty

    if remaining > 0:
        raise ValueError(f"Insufficient stock for component '{component.name}'. Missing {remaining:.3f}.")


def _create_ref_items_from_instances(line: TemplateComponent):
    """Create one TemplateComponentRef per designator from the line's instances.

    Reads refs/tstamp/metadata from attributes.instances when available, falling
    back to the cached refs list. Keeps the denormalized cache in sync.
    """
    attributes = line.attributes if isinstance(line.attributes, dict) else {}
    instances_by_ref = {
        inst["ref"]: inst
        for inst in (attributes.get("instances") or [])
        if isinstance(inst, dict) and inst.get("ref")
    }
    refs = line.refs or list(instances_by_ref.keys())
    new_items = []
    for position, ref in enumerate(refs):
        instance = instances_by_ref.get(ref) or {}
        new_items.append(
            TemplateComponentRef(
                line=line,
                template_id=line.template_id,
                ref=ref,
                tstamp=instance.get("tstamp"),
                metadata=instance or {},
                position=position,
            )
        )
    if new_items:
        TemplateComponentRef.objects.bulk_create(new_items)
    line.sync_ref_cache()


def _merge_lines(target: TemplateComponent, source: TemplateComponent) -> TemplateComponent:
    """Move all of source's ref children + scans into target, then delete source."""
    source.ref_items.update(line=target, template=target.template)
    TemplateComponentScan.objects.filter(template_component=source).update(template_component=target)
    target.sync_ref_cache()
    _recalculate_scan_totals(target)
    source.delete()
    return target


def _assign_component_to_refs(
    line: TemplateComponent,
    component: Component | None,
    refs: list[str] | None,
) -> tuple[TemplateComponent, bool]:
    """Assign `component` to the given refs of `line` (default: all refs).

    Implements both split (subset of refs → different component) and auto-merge
    (target component already has a line in this template). Returns the resulting
    line and whether a merge with an existing line happened.

    Scan progress: a whole-line move into an existing line combines scans (merge);
    a partial move leaves scans on the original line (split).
    """
    all_refs = list(line.ref_items.order_by("position", "ref").values_list("ref", flat=True))
    selected = [r for r in (refs or all_refs) if r in all_refs] or all_refs
    is_whole_line = len(selected) >= len(all_refs)

    existing_target = None
    if component is not None:
        existing_target = (
            TemplateComponent.objects.filter(template=line.template, component=component)
            .exclude(id=line.id)
            .order_by("position", "created_at")
            .first()
        )

    # Case 1: a line for this component already exists → move refs into it.
    if existing_target is not None:
        if is_whole_line:
            _merge_lines(existing_target, line)
            return existing_target, True
        line.ref_items.filter(ref__in=selected).update(
            line=existing_target, template=existing_target.template
        )
        existing_target.sync_ref_cache()
        line.sync_ref_cache()
        return existing_target, True

    # Case 2: no existing target.
    if is_whole_line:
        if component is not None:
            line.component = component
            line.save(update_fields=["component"])
        return line, False

    # Partial move with no existing target → split into a new line.
    new_line = TemplateComponent.objects.create(
        template=line.template,
        component=component if component is not None else line.component,
        position=line.position,
        notes=line.notes,
        attributes={},
        source_type=line.source_type,
        value=line.value,
        footprint=line.footprint,
        datasheet=line.datasheet,
        bom_description=line.bom_description,
        dnp=line.dnp,
        needs_review=line.needs_review,
        import_snapshot={},
    )
    line.ref_items.filter(ref__in=selected).update(line=new_line, template=new_line.template)
    new_line.sync_ref_cache()
    line.sync_ref_cache()
    return new_line, False


def _apply_import_rows(template: Template, parsed_rows: list[dict[str, Any]], mode: str):
    if mode not in {"replace", "merge"}:
        raise ValueError("Import mode must be 'replace' or 'merge'.")

    has_existing = template.components.exists()
    if has_existing and not mode:
        raise ValueError("Import mode is required for BOMs that already contain rows.")

    if mode == "replace":
        template.components.all().delete()
    else:
        template.components.filter(source_type="imported").delete()

    created = 0
    for idx, row in enumerate(parsed_rows):
        line = TemplateComponent.objects.create(
            template=template,
            component=row.get("component"),
            position=idx,
            notes=f"Imported netlist row ({row.get('ref_group') or 'manual'})",
            attributes=row.get("attributes") or {},
            source_type=row.get("source_type", "imported"),
            ref_group=row.get("ref_group"),
            refs=row.get("refs") or [],
            qty_per_board=row.get("qty_per_board") or 1,
            value=row.get("value"),
            footprint=row.get("footprint"),
            datasheet=row.get("datasheet"),
            bom_description=row.get("bom_description"),
            dnp=bool(row.get("dnp")),
            needs_review=bool(row.get("needs_review")),
            import_snapshot=row.get("import_snapshot") or {},
        )
        _create_ref_items_from_instances(line)
        created += 1

    return created


def _next_working_series_name(template: Template) -> str:
    existing_count = template.working_copies.count()
    if existing_count == 0:
        return f"{template.name} (working)"
    return f"{template.name} #{existing_count + 1}"


def _working_qty_from_template(template: Template, qty_planned: int | None = None) -> int:
    if qty_planned is not None:
        return max(qty_planned, 1)
    if template.qty_planned > 0:
        return template.qty_planned
    return 1


def _clone_template_series(
    template: Template,
    *,
    name: str | None = None,
    qty_planned: int | None = None,
    planned_date=None,
    user=None,
) -> Template:
    clone = Template.objects.create(
        production=template.production,
        name=name or _next_working_series_name(template),
        description=template.description,
        version=template.version,
        series_kind="working",
        source_template=template if template.series_kind == "template" else template.source_template,
        status="draft",
        qty_planned=_working_qty_from_template(template, qty_planned),
        planned_date=planned_date if planned_date is not None else template.planned_date,
        source_url=template.source_url,
        source_hash=template.source_hash,
        source_file=template.source_file,
        source_imported_at=template.source_imported_at,
        ibom_url=template.ibom_url,
        ibom_file=template.ibom_file,
        ibom_updated_at=template.ibom_updated_at,
        production_checkpoint={},
    )

    components = template.components.all().order_by("position", "created_at").prefetch_related("ref_items")
    for idx, item in enumerate(components):
        clone_line = TemplateComponent.objects.create(
            template=clone,
            component=item.component,
            position=idx,
            notes=item.notes,
            attributes=item.attributes,
            source_type=item.source_type,
            ref_group=item.ref_group,
            refs=item.refs,
            qty_per_board=item.qty_per_board,
            qty_override_total=item.qty_override_total,
            value=item.value,
            footprint=item.footprint,
            datasheet=item.datasheet,
            bom_description=item.bom_description,
            dnp=item.dnp,
            needs_review=item.needs_review,
            import_snapshot=item.import_snapshot,
            sourced_total=0,
            placed_total=0,
        )
        ref_clones = [
            TemplateComponentRef(
                line=clone_line,
                template=clone,
                ref=ref_item.ref,
                tstamp=ref_item.tstamp,
                metadata=ref_item.metadata,
                position=ref_item.position,
            )
            for ref_item in item.ref_items.all()
        ]
        if ref_clones:
            TemplateComponentRef.objects.bulk_create(ref_clones)

    return clone


def _import_xml_bytes_into_template(
    template: Template,
    xml_bytes: bytes,
    mode: str,
    source_url: str | None = None,
    source_filename: str | None = None,
    *,
    user=None,
    create_working_copy: bool = True,
):
    if template.series_kind == "working" and template.components.exists():
        raise ValueError(
            "Netlist import is only allowed on template series or empty series. "
            "Create a working copy from the template instead."
        )

    parsed_rows = _parse_netlist_components(xml_bytes)
    created = _apply_import_rows(template, parsed_rows, mode)
    working_qty_planned = template.qty_planned

    filename = (source_filename or "netlist.xml").strip() or "netlist.xml"
    template.source_file.save(filename, ContentFile(xml_bytes), save=False)
    template.source_hash = _sha256_digest(xml_bytes)
    template.source_imported_at = timezone.now()
    if source_url is not None:
        template.source_url = source_url or None
    template.series_kind = "template"
    template.qty_planned = 0
    template.status = "locked"
    template.locked_at = timezone.now()
    template.locked_by = user
    template.save()

    working_copy = None
    should_create_working = create_working_copy and template.working_copies.count() == 0
    if should_create_working:
        working_copy = _clone_template_series(template, qty_planned=working_qty_planned, user=user)

    return created, working_copy


class ProductionFolderViewSet(viewsets.ModelViewSet):
    """ViewSet pro ProductionFolder s hierarchickou strukturou"""

    permission_classes = [IsAuthenticated]
    queryset = ProductionFolder.objects.all()
    serializer_class = ProductionFolderSerializer
    pagination_class = CustomPagination

    def get_serializer_class(self):
        if self.action == "list":
            return ProductionFolderListSerializer
        return ProductionFolderSerializer

    def build_tree(self, folders, parent=None):
        tree = []
        for folder in folders:
            if folder.parent == parent:
                children = self.build_tree(folders, folder)
                tree.append(
                    {
                        "id": folder.id,
                        "name": folder.name,
                        "description": folder.description,
                        "full_path": folder.full_path,
                        "children": children,
                        "created_at": folder.created_at,
                    }
                )
        return tree

    @action(detail=False, methods=["get"], url_path="tree")
    def tree(self, request):
        folders = ProductionFolder.objects.all()
        tree = self.build_tree(folders)
        return Response(tree)


class ProductionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Production.objects.select_related("folder", "component_reference").all()
    serializer_class = ProductionSerializer
    pagination_class = CustomPagination

    def get_serializer_class(self):
        if self.action == "list":
            return ProductionListSerializer
        return ProductionSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        folder_id = self.request.query_params.get("folder", None)
        if folder_id:
            queryset = queryset.filter(folder_id=folder_id)

        search = self.request.query_params.get("search", None)
        if search:
            queryset = queryset.filter(name__icontains=search)

        return queryset.order_by("-created_at")

    @action(detail=False, methods=["get"], url_path="used-in")
    def used_in(self, request):
        component_id = request.query_params.get("component")
        if not component_id:
            return Response({"error": "component query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        rows = (
            TemplateComponent.objects.filter(component_id=component_id)
            .select_related("template", "template__production")
            .order_by("-template__planned_date", "-template__created_at")
        )

        seen = set()
        payload = []
        for row in rows:
            bom = row.template
            if bom.id in seen:
                continue
            seen.add(bom.id)
            payload.append(
                {
                    "bom_id": str(bom.id),
                    "bom_name": bom.name,
                    "product_id": str(bom.production_id),
                    "product_name": bom.production.name,
                    "status": bom.status,
                    "planned_date": bom.planned_date,
                }
            )

        return Response(payload)


class TemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = (
        Template.objects.select_related("production")
        .prefetch_related(
            "components",
            "components__component__parameters__parameter_type",
            "components__scans",
            "components__ref_items",
        )
        .all()
    )
    serializer_class = TemplateSerializer
    pagination_class = CustomPagination

    def get_serializer_class(self):
        if self.action == "list":
            return TemplateListSerializer
        return TemplateSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        production_id = self.request.query_params.get("production", None)
        if production_id:
            queryset = queryset.filter(production_id=production_id)
        return queryset.order_by("-created_at")

    @action(detail=True, methods=["post"], url_path="duplicate")
    @transaction.atomic
    def duplicate(self, request, pk=None):
        template = self.get_object()
        requested_name = _normalize_text(request.data.get("name"))
        qty_planned = request.data.get("qty_planned")
        planned_date = request.data.get("planned_date")

        clone = _clone_template_series(
            template,
            name=requested_name or None,
            qty_planned=int(qty_planned) if qty_planned is not None else None,
            planned_date=planned_date or None,
            user=request.user,
        )

        serializer = self.get_serializer(clone)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="lock")
    def lock(self, request, pk=None):
        template = self.get_object()
        template.status = "locked"
        template.locked_at = timezone.now()
        template.locked_by = request.user
        template.save(update_fields=["status", "locked_at", "locked_by"])
        return Response({"success": True, "status": template.status})

    @action(detail=True, methods=["post"], url_path="ibom", parser_classes=[MultiPartParser, FormParser])
    def set_ibom(self, request, pk=None):
        template = self.get_object()

        ibom_url = _normalize_text(request.data.get("ibom_url"))
        if ibom_url and not ibom_url.lower().startswith("https://"):
            return Response({"error": "iBOM URL must use HTTPS."}, status=status.HTTP_400_BAD_REQUEST)

        ibom_file = request.FILES.get("ibom_file")
        if not ibom_url and not ibom_file:
            return Response({"error": "Provide ibom_url or ibom_file."}, status=status.HTTP_400_BAD_REQUEST)

        if ibom_url:
            template.ibom_url = ibom_url
        if ibom_file:
            template.ibom_file = inject_ni_bridge_into_upload(ibom_file)

        template.ibom_updated_at = timezone.now()
        template.save()

        serializer = self.get_serializer(template)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="ibom-state")
    def ibom_state(self, request, pk=None):
        template = self.get_object()
        components = []
        for line in template.components.select_related("component").all().order_by("position", "id"):
            components.append(
                {
                    "id": str(line.id),
                    "refs": line.refs or [],
                    "value": line.value or "",
                    "footprint": line.footprint or "",
                    "sourced_total": float(line.sourced_total),
                    "placed_total": float(line.placed_total),
                    "qty_per_board": line.qty_per_board,
                    "dnp": line.dnp,
                }
            )
        return Response(
            {
                "template_id": str(template.id),
                "qty_planned": template.qty_planned,
                "components": components,
            }
        )

    @action(detail=True, methods=["post"], url_path="ibom-event")
    @transaction.atomic
    def ibom_event(self, request, pk=None):
        template = self.get_object()
        event_type = _normalize_text(request.data.get("type"))
        checkbox = _normalize_text(request.data.get("checkbox"))
        refs_list = request.data.get("refs", [])
        state = _normalize_text(request.data.get("state"))

        if event_type != "ibom.checkbox":
            return Response({"error": "Unsupported event type."}, status=status.HTTP_400_BAD_REQUEST)
        if not refs_list or not isinstance(refs_list, list):
            return Response({"error": "refs must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)
        if checkbox not in {"Sourced", "Placed"}:
            return Response({"error": "checkbox must be Sourced or Placed."}, status=status.HTTP_400_BAD_REQUEST)

        is_checked = state == "checked"
        field = "sourced_total" if checkbox == "Sourced" else "placed_total"
        updated = []

        ref_set = set(refs_list)
        for line in template.components.all():
            line_refs = set(line.refs or [])
            matched = line_refs & ref_set
            if not matched:
                continue

            count = len(matched)
            current = float(getattr(line, field))
            if is_checked:
                new_val = current + count
            else:
                new_val = max(current - count, 0)

            setattr(line, field, Decimal(str(new_val)))
            line.save(update_fields=[field])
            updated.append(
                {
                    "line_id": str(line.id),
                    field: new_val,
                }
            )

        return Response({"success": True, "updated": updated})

    @action(detail=True, methods=["post"], url_path="import-bom", parser_classes=[MultiPartParser, FormParser])
    @transaction.atomic
    def import_bom(self, request, pk=None):
        template = self.get_object()
        mode = _normalize_text(request.data.get("mode")).lower() or ""
        if template.components.exists() and mode not in {"replace", "merge"}:
            return Response(
                {"error": "mode is required for non-empty BOM and must be replace/merge."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not mode:
            mode = "replace"

        xml_file = request.FILES.get("file")
        if not xml_file:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            xml_bytes = xml_file.read()
            source_url = None
            if request.data.get("source_url"):
                source_url = _normalize_text(request.data.get("source_url"))
                if source_url and not source_url.lower().startswith("https://"):
                    return Response({"error": "Source URL must use HTTPS."}, status=status.HTTP_400_BAD_REQUEST)
            create_working_copy = request.data.get("create_working_copy", "true")
            if isinstance(create_working_copy, str):
                create_working_copy = create_working_copy.lower() not in {"0", "false", "no"}

            created, working_copy = _import_xml_bytes_into_template(
                template=template,
                xml_bytes=xml_bytes,
                mode=mode,
                source_url=source_url,
                source_filename=xml_file.name,
                user=request.user,
                create_working_copy=create_working_copy,
            )

            payload = {
                "success": True,
                "mode": mode,
                "rows_created": created,
                "hash": template.source_hash,
                "imported_at": template.source_imported_at,
                "series_kind": template.series_kind,
            }
            if working_copy:
                payload["working_copy_id"] = str(working_copy.id)
            return Response(payload, status=status.HTTP_200_OK)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ET.ParseError as exc:
            return Response({"error": f"Invalid XML file: {exc}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"error": f"Error processing BOM: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=["post"], url_path="import-url")
    @transaction.atomic
    def import_from_url(self, request, pk=None):
        template = self.get_object()
        mode = _normalize_text(request.data.get("mode")).lower() or ""
        if template.components.exists() and mode not in {"replace", "merge"}:
            return Response(
                {"error": "mode is required for non-empty BOM and must be replace/merge."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not mode:
            mode = "replace"

        source_url = _normalize_text(request.data.get("source_url"))
        if not source_url:
            return Response({"error": "source_url is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not source_url.lower().startswith("https://"):
            return Response({"error": "Source URL must use HTTPS."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            req = Request(source_url, headers={"User-Agent": "NextIntranet-Manufacturing/1.0"})
            with urlopen(req, timeout=20) as response:
                xml_bytes = response.read()

            incoming_hash = _sha256_digest(xml_bytes)
            if template.source_hash and template.source_hash == incoming_hash:
                return Response(
                    {
                        "success": True,
                        "changed": False,
                        "message": "No changes detected",
                        "hash": incoming_hash,
                    }
                )

            filename = (urlparse(source_url).path.rsplit("/", 1)[-1] or "netlist.xml").strip() or "netlist.xml"
            create_working_copy = request.data.get("create_working_copy", "true")
            if isinstance(create_working_copy, str):
                create_working_copy = create_working_copy.lower() not in {"0", "false", "no"}

            created, working_copy = _import_xml_bytes_into_template(
                template=template,
                xml_bytes=xml_bytes,
                mode=mode,
                source_url=source_url,
                source_filename=filename,
                user=request.user,
                create_working_copy=create_working_copy,
            )

            payload = {
                "success": True,
                "changed": True,
                "mode": mode,
                "rows_created": created,
                "hash": incoming_hash,
                "imported_at": template.source_imported_at,
                "series_kind": template.series_kind,
            }
            if working_copy:
                payload["working_copy_id"] = str(working_copy.id)
            return Response(payload)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ET.ParseError as exc:
            return Response({"error": f"Invalid XML from URL: {exc}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"error": f"Failed to import from URL: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="re-import")
    @transaction.atomic
    def re_import(self, request, pk=None):
        template = self.get_object()
        if not template.source_url:
            return Response({"error": "BOM has no source_url configured."}, status=status.HTTP_400_BAD_REQUEST)

        mode = _normalize_text(request.data.get("mode")).lower() or ""
        if template.components.exists() and mode not in {"replace", "merge"}:
            return Response(
                {"error": "mode is required for non-empty BOM and must be replace/merge."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not mode:
            mode = "merge"

        try:
            req = Request(template.source_url, headers={"User-Agent": "NextIntranet-Manufacturing/1.0"})
            with urlopen(req, timeout=20) as response:
                xml_bytes = response.read()

            incoming_hash = _sha256_digest(xml_bytes)
            if template.source_hash and template.source_hash == incoming_hash:
                return Response(
                    {
                        "success": True,
                        "changed": False,
                        "message": "No changes detected",
                        "hash": incoming_hash,
                    }
                )

            filename = (urlparse(template.source_url).path.rsplit("/", 1)[-1] or "netlist.xml").strip() or "netlist.xml"
            created, working_copy = _import_xml_bytes_into_template(
                template=template,
                xml_bytes=xml_bytes,
                mode=mode,
                source_url=template.source_url,
                source_filename=filename,
                user=request.user,
                create_working_copy=False,
            )
            payload = {
                "success": True,
                "changed": True,
                "mode": mode,
                "rows_created": created,
                "hash": template.source_hash,
                "imported_at": template.source_imported_at,
                "series_kind": template.series_kind,
            }
            if working_copy:
                payload["working_copy_id"] = str(working_copy.id)
            return Response(payload)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ET.ParseError as exc:
            return Response({"error": f"Invalid XML from URL: {exc}"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"error": f"Failed to re-import URL: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"], url_path="availability")
    def availability(self, request, pk=None):
        template = self.get_object()

        home_location_ids = None
        home_location_full_path = None
        user_settings = UserSetting.objects.filter(user=request.user).select_related("home_location").first()
        if user_settings and user_settings.home_location:
            home_location_ids = set(
                user_settings.home_location.get_descendants(include_self=True).values_list("id", flat=True)
            )
            home_location_full_path = user_settings.home_location.full_path

        rows = []
        lines_qs = (
            template.components.select_related("component")
            .prefetch_related("component__packets__location", "component__reservations")
            .order_by("position", "id")
        )
        template_id_str = str(template.id)
        for line in lines_qs:
            needed_total = _line_needed_total(line, template.qty_planned)
            locations = _line_locations(line.component, home_location_ids)
            total_quantity = sum(_safe_float(loc.get("quantity") or 0) for loc in locations)
            # Available = total minus reservations that are NOT for this BOM (self-reservations don't reduce availability here)
            if line.component:
                total_reserved = sum(
                    _safe_float(r.quantity) for r in line.component.reservations.all()
                )
                reserved_for_this_bom = sum(
                    _safe_float(r.quantity)
                    for r in line.component.reservations.all()
                    if any(
                        s.get("bom_id") == template_id_str
                        for s in (r.sources or [])
                    )
                )
                other_reserved = total_reserved - reserved_for_this_bom
                inventory_total = max(0.0, total_quantity - other_reserved)
            else:
                inventory_total = 0.0
            total_in_home = None
            if home_location_ids and line.component:
                total_in_home = sum(
                    _safe_float(p.count)
                    for p in line.component.packets.all()
                    if p.location_id in home_location_ids
                )
            # DNP lines are not populated, so do not report shortage
            shortage = not line.dnp and (float(needed_total) > inventory_total)
            row = {
                "id": str(line.id),
                "ref_group": line.ref_group,
                "value": line.value,
                "footprint": line.footprint,
                "dnp": line.dnp,
                "linked_component": str(line.component_id) if line.component_id else None,
                "linked_component_name": line.component.name if line.component else None,
                "needed_total": float(needed_total),
                "in_stock": inventory_total,
                "total_quantity": total_quantity,
                "locations": locations,
                "shortage": shortage,
                "unlinked": line.component_id is None,
            }
            if total_in_home is not None:
                row["total_in_home"] = total_in_home
            rows.append(row)

        payload = {
            "bom_id": str(template.id),
            "qty_planned": template.qty_planned,
            "rows": rows,
        }
        if home_location_full_path is not None:
            payload["home_location_full_path"] = home_location_full_path
        return Response(payload)

    @action(detail=True, methods=["post"], url_path="scan")
    @transaction.atomic
    def scan(self, request, pk=None):
        template = self.get_object()
        if template.series_kind == "template":
            return Response(
                {"error": "Scanner is only available on working series. Create a working copy from the template."},
                status=status.HTTP_409_CONFLICT,
            )
        mode = _normalize_text(request.data.get("mode")).upper()
        barcode = _normalize_text(request.data.get("barcode"))
        decision = _normalize_text(request.data.get("decision")).lower()
        line_id = _normalize_text(request.data.get("line_id"))

        if mode not in {"FIND", "SOURCED", "PLACED"}:
            return Response({"error": "mode must be FIND, SOURCED or PLACED."}, status=status.HTTP_400_BAD_REQUEST)
        if not barcode:
            return Response({"error": "barcode is required."}, status=status.HTTP_400_BAD_REQUEST)

        resolved = _resolve_barcode(barcode)
        if not resolved:
            return Response(
                {
                    "result": "unknown_barcode",
                    "message": "Unknown barcode",
                    "mode": mode,
                    "actions": ["ignore", "search_component"],
                }
            )

        component = resolved.get("component")
        packet = resolved.get("packet")

        line = None
        if line_id:
            line = (
                template.components.filter(id=line_id)
                .select_related("component")
                .first()
            )
            if not line:
                return Response({"error": "BOM line not found."}, status=status.HTTP_404_NOT_FOUND)
            if line.component_id is None:
                return Response(
                    {"error": "Selected BOM line is unlinked. Use Change first."},
                    status=status.HTTP_409_CONFLICT,
                )
            if component and line.component_id != component.id:
                return Response(
                    {
                        "error": "Selected bag does not match linked component on this BOM line.",
                        "result": "component_mismatch",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        else:
            line = (
                template.components.filter(component=component)
                .order_by("dnp", "position", "id")
                .first()
            )

        if not line:
            if decision in {"add_to_bom", "add_and_attach_bag", "add"}:
                line = TemplateComponent.objects.create(
                    template=template,
                    component=component,
                    position=(template.components.aggregate(max_pos=Max("position")).get("max_pos") or 0) + 1,
                    notes="Added from scanner",
                    attributes={},
                    source_type="manual",
                    ref_group=None,
                    refs=[],
                    qty_per_board=1,
                    value=component.name,
                    footprint="",
                    datasheet="",
                    bom_description="Added from scanner in production mode.",
                    dnp=False,
                    needs_review=False,
                    import_snapshot={},
                )
            else:
                return Response(
                    {
                        "result": "not_in_bom",
                        "message": "Resolved component is not linked in this BOM.",
                        "mode": mode,
                        "resolved_component": {
                            "id": str(component.id),
                            "name": component.name,
                        },
                        "actions": ["ignore", "add_to_bom"],
                    }
                )

        if mode == "FIND":
            return Response(
                {
                    "result": "found",
                    "line_id": str(line.id),
                    "message": "Found in BOM",
                }
            )

        if template.status == "locked":
            return Response({"error": "BOM is locked."}, status=status.HTTP_409_CONFLICT)

        scan = TemplateComponentScan.objects.create(
            template=template,
            template_component=line,
            mode="sourced" if mode == "SOURCED" else "placed",
            barcode=barcode,
            resolved_component=component,
            resolved_packet_id=packet.id if packet else None,
            qty=_safe_decimal(request.data.get("qty") or 1),
        )

        sourced_total, placed_total = _recalculate_scan_totals(line)

        if template.status == "draft":
            template.status = "in_progress"
            template.save(update_fields=["status"])

        return Response(
            {
                "result": "saved",
                "scan_id": str(scan.id),
                "line_id": str(line.id),
                "sourced_total": float(sourced_total),
                "placed_total": float(placed_total),
                "mode": mode,
            }
        )

    @action(detail=True, methods=["post"], url_path="undo-last-scan")
    @transaction.atomic
    def undo_last_scan(self, request, pk=None):
        template = self.get_object()
        line_id = request.data.get("line_id")

        scans = TemplateComponentScan.objects.filter(template=template)
        if line_id:
            scans = scans.filter(template_component_id=line_id)

        last_scan = scans.order_by("-created_at").first()
        if not last_scan:
            return Response({"error": "No scan to undo."}, status=status.HTTP_404_NOT_FOUND)

        line = last_scan.template_component
        last_scan.delete()

        sourced_total, placed_total = _recalculate_scan_totals(line)

        return Response(
            {
                "success": True,
                "line_id": str(line.id),
                "sourced_total": float(sourced_total),
                "placed_total": float(placed_total),
            }
        )

    @action(detail=True, methods=["post"], url_path="remove-scan")
    @transaction.atomic
    def remove_scan(self, request, pk=None):
        template = self.get_object()
        if template.status == "locked":
            return Response({"error": "BOM is locked."}, status=status.HTTP_409_CONFLICT)

        scan_id = _normalize_text(request.data.get("scan_id"))
        if not scan_id:
            return Response({"error": "scan_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        scan = (
            TemplateComponentScan.objects.filter(template=template, id=scan_id)
            .select_related("template_component")
            .first()
        )
        if not scan:
            return Response({"error": "Scan not found."}, status=status.HTTP_404_NOT_FOUND)

        line = scan.template_component
        scan.delete()
        sourced_total, placed_total = _recalculate_scan_totals(line)

        return Response(
            {
                "success": True,
                "line_id": str(line.id),
                "sourced_total": float(sourced_total),
                "placed_total": float(placed_total),
            }
        )

    @action(detail=True, methods=["post"], url_path="finalize")
    @transaction.atomic
    def finalize(self, request, pk=None):
        template = self.get_object()
        if template.status == "locked":
            return Response({"error": "BOM is already locked."}, status=status.HTTP_409_CONFLICT)

        actual_used_map = request.data.get("actual_used") or {}
        if not isinstance(actual_used_map, dict):
            actual_used_map = {}

        errors = []
        for line in template.components.select_related("component").all().order_by("position", "id"):
            if line.dnp:
                continue

            needed_total = _line_needed_total(line, template.qty_planned)
            actual_used = _safe_float(actual_used_map.get(str(line.id), float(needed_total)))
            if actual_used <= 0:
                continue

            if not line.component:
                errors.append(f"Line '{line.value or line.ref_group or line.id}' is not linked to a component.")
                continue

            try:
                _consume_component(
                    component=line.component,
                    qty=actual_used,
                    reference=template.id,
                    user=request.user,
                    description=f"Manufacturing finalize: {template.name}",
                )
            except ValueError as exc:
                errors.append(str(exc))

        if errors:
            transaction.set_rollback(True)
            return Response({"error": "Finalize failed.", "details": errors}, status=status.HTTP_400_BAD_REQUEST)

        template.status = "locked"
        template.locked_at = timezone.now()
        template.locked_by = request.user
        template.save(update_fields=["status", "locked_at", "locked_by"])

        return Response({"success": True, "status": template.status})

    @action(detail=True, methods=["post"], url_path="print-a4")
    def print_a4(self, request, pk=None):
        template = self.get_object()
        include_dnp_raw = request.data.get("include_dnp", request.query_params.get("include_dnp", "false"))
        include_dnp = str(include_dnp_raw).lower() == "true"

        lines = template.components.select_related("component").all().order_by("position", "id")
        if not include_dnp:
            lines = lines.filter(dnp=False)

        pdf = FPDF(orientation="P", unit="mm", format="A4")
        pdf.set_auto_page_break(auto=True, margin=12)
        pdf.add_page()

        pdf.set_font("Arial", "B", 14)
        pdf.cell(0, 8, f"BOM: {template.name}", ln=1)
        pdf.set_font("Arial", "", 10)
        pdf.cell(0, 6, f"Product: {template.production.name}", ln=1)
        pdf.cell(0, 6, f"Planned qty: {template.qty_planned}x", ln=1)
        if template.description:
            pdf.multi_cell(0, 5, f"Notes: {template.description}")
            pdf.ln(1)

        headers = ["Ref", "Value", "Footprint", "Needed", "Linked component", "Locations"]
        widths = [30, 35, 45, 18, 35, 27]

        pdf.set_font("Arial", "B", 8)
        for head, width in zip(headers, widths):
            pdf.cell(width, 6, head, border=1)
        pdf.ln()

        pdf.set_font("Arial", "", 7)
        for line in lines:
            needed_total = float(_line_needed_total(line, template.qty_planned))
            locations = _line_locations(line.component)
            location_text = ", ".join([f"{loc['location']} ({loc['quantity']:.2f})" for loc in locations])
            row = [
                (line.ref_group or "-")[:40],
                (line.value or "-")[:40],
                (line.footprint or "-")[:50],
                f"{needed_total:g}",
                (line.component.name if line.component else "Unlinked")[:35],
                location_text[:70] or "-",
            ]
            for text, width in zip(row, widths):
                pdf.cell(width, 5, text, border=1)
            pdf.ln()

        out = pdf.output(dest="S")
        if isinstance(out, str):
            out_bytes = out.encode("latin-1")
        else:
            out_bytes = bytes(out)
        queue_id = request.query_params.get("print_list") or request.data.get("print_list")
        if queue_id:
            queue = PrintList.objects.filter(id=queue_id, owner=request.user).first()
            if not queue:
                queue = PrintList.objects.filter(id=queue_id, is_public=True).first()
        else:
            queue = PrintList.objects.filter(owner=request.user, is_default=True).first()
            if not queue:
                queue = PrintList.objects.filter(owner=request.user).order_by("created_at").first()

        if not queue:
            return Response(
                {"error": "No print queue available. Create a queue first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        print_file = PrintFile.objects.create(
            owner=request.user,
            name=f"BOM {template.name} A4",
            kind=PrintFile.KIND_GENERATED,
        )
        print_file.file.save(f"bom-{template.id}.pdf", ContentFile(out_bytes), save=True)

        item = PrintItem.objects.create(
            print_list=queue,
            kind=PrintItem.KIND_DOCUMENT,
            status=PrintItem.STATUS_QUEUED,
            content_type=ContentType.objects.get_for_model(PrintFile),
            object_id=print_file.id,
            payload={
                "document_format": "a4",
                "source": "manufacturing",
                "bom_id": str(template.id),
                "include_dnp": include_dnp,
            },
        )
        return Response(
            {
                "success": True,
                "print_item_id": str(item.id),
                "print_queue_id": str(queue.id),
                "print_queue_name": queue.name,
            }
        )


class TemplateComponentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = TemplateComponent.objects.select_related("template", "component").all()
    serializer_class = TemplateComponentSerializer
    pagination_class = CustomPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        template_id = self.request.query_params.get("template", None)
        if template_id:
            queryset = queryset.filter(template_id=template_id)
        return queryset.order_by("position")

    def _ensure_editable(self, template: Template):
        if template.status == "locked":
            raise ValueError("BOM is locked and cannot be edited.")

    def create(self, request, *args, **kwargs):
        template_id = request.data.get("template")
        if template_id:
            template = get_object_or_404(Template, id=template_id)
            if template.status == "locked":
                return Response({"error": "BOM is locked and cannot be edited."}, status=status.HTTP_409_CONFLICT)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.template.status == "locked":
            return Response({"error": "BOM is locked and cannot be edited."}, status=status.HTTP_409_CONFLICT)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.template.status == "locked":
            return Response({"error": "BOM is locked and cannot be edited."}, status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="set-component")
    @transaction.atomic
    def set_component(self, request, pk=None):
        """Assign a linked component to all or selected references of this line.

        A subset of refs splits the line; assigning a component that already has
        a line in the template merges into it (auto-merge).
        """
        line = self.get_object()
        if line.template.status == "locked":
            return Response({"error": "BOM is locked and cannot be edited."}, status=status.HTTP_409_CONFLICT)

        component = None
        if request.data.get("component"):
            component = get_object_or_404(Component, id=request.data.get("component"))

        refs = request.data.get("refs") or None
        if refs is not None and not isinstance(refs, list):
            return Response({"error": "refs must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        result_line, merged = _assign_component_to_refs(line, component, refs)
        serializer = TemplateComponentSerializer(result_line)
        return Response({"line": serializer.data, "merged": merged})

    @action(detail=True, methods=["post"], url_path="split")
    @transaction.atomic
    def split(self, request, pk=None):
        """Split selected references off this line into a new line (same component)."""
        line = self.get_object()
        if line.template.status == "locked":
            return Response({"error": "BOM is locked and cannot be edited."}, status=status.HTTP_409_CONFLICT)
        refs = request.data.get("refs") or []
        if not isinstance(refs, list) or not refs:
            return Response({"error": "refs must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)

        new_line, _ = _assign_component_to_refs(line, line.component, refs)
        if new_line.id == line.id:
            return Response({"error": "Select a subset of references to split."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "original": TemplateComponentSerializer(line).data,
                "new": TemplateComponentSerializer(new_line).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="merge")
    @transaction.atomic
    def merge(self, request, pk=None):
        """Merge other lines (by id) into this line."""
        target = self.get_object()
        if target.template.status == "locked":
            return Response({"error": "BOM is locked and cannot be edited."}, status=status.HTTP_409_CONFLICT)
        source_ids = request.data.get("ids") or ([request.data.get("into_id")] if request.data.get("into_id") else [])
        sources = TemplateComponent.objects.filter(
            template=target.template, id__in=[sid for sid in source_ids if sid]
        ).exclude(id=target.id)
        for source in sources:
            _merge_lines(target, source)
        return Response({"line": TemplateComponentSerializer(target).data})


class RealizationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Realization.objects.select_related("production", "template").prefetch_related("components").all()
    serializer_class = RealizationSerializer
    pagination_class = CustomPagination

    def get_serializer_class(self):
        if self.action == "list":
            return RealizationListSerializer
        return RealizationSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        production_id = self.request.query_params.get("production", None)
        if production_id:
            queryset = queryset.filter(production_id=production_id)

        status_filter = self.request.query_params.get("status", None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset.order_by("-created_at")


class RealizationComponentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = RealizationComponent.objects.select_related("realization", "component", "template_component").all()
    serializer_class = RealizationComponentSerializer
    pagination_class = CustomPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        realization_id = self.request.query_params.get("realization", None)
        if realization_id:
            queryset = queryset.filter(realization_id=realization_id)
        return queryset.order_by("position")
