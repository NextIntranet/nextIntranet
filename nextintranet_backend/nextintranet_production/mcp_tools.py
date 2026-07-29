from django.db import transaction
from django.utils import timezone
from mcp_server import MCPToolset

from nextintranet_warehouse.models.component import Component
from nextintranet_warehouse.mcp_tools import _mcp_service_token, _require_read, _require_write
from nextintranet_production.models import Production, Template, TemplateComponent
from nextintranet_production.models.production import CLOSED_TEMPLATE_STATUSES
from nextintranet_production.mcp_serializers import (
    MCPProductionListSerializer,
    MCPProductionSerializer,
    MCPBomListSerializer,
    MCPBomDetailSerializer,
    MCPBomLineSerializer,
)
from nextintranet_production.services.bom import (
    bom_availability_rows,
    assign_component_to_refs,
    unlink_component,
    line_needed_total,
    consume_component,
    safe_float,
)

MCP_LIST_DEFAULT_LIMIT = 200
MCP_LIST_MAX_LIMIT = 500


def _clamp_list_limit(limit: int, default: int = MCP_LIST_DEFAULT_LIMIT, maximum: int = MCP_LIST_MAX_LIMIT) -> int:
    if limit <= 0:
        return default
    return min(max(limit, 1), maximum)


def _mcp_actor_user(request):
    """Resolve the Django user behind the service token, if any (e.g. for locked_by/author FKs)."""
    token = _mcp_service_token(request)
    if token and token.created_by and token.created_by.is_active:
        return token.created_by
    return None


def _ensure_bom_editable(template: Template):
    if template.status in CLOSED_TEMPLATE_STATUSES:
        raise ValueError("BOM is locked or finished and cannot be edited.")


class ProductionReadToolset(MCPToolset):
    """Read-only tools for production BOM data access."""

    def list_productions(self, query: str = "", folder_id: str = "", limit: int = 50) -> list[dict]:
        """List production projects (products/types of manufacturing).

        Args:
            query: Optional text search across name.
            folder_id: Optional UUID to filter by production folder.
            limit: Maximum number of results (default 50, max 200).
        """
        _require_read(self.request)

        qs = Production.objects.select_related("folder", "component_reference").all()
        if query:
            qs = qs.filter(name__icontains=query)
        if folder_id:
            qs = qs.filter(folder_id=folder_id)

        row_limit = _clamp_list_limit(limit, default=50, maximum=200)
        return MCPProductionListSerializer(qs.order_by("name")[:row_limit], many=True).data

    def get_production(self, production_id: str) -> dict:
        """Get a single production project by ID.

        Args:
            production_id: UUID of the production.
        """
        _require_read(self.request)
        production = Production.objects.select_related("folder", "component_reference").get(id=production_id)
        return MCPProductionSerializer(production).data

    def list_boms(
        self,
        production_id: str = "",
        series_kind: str = "",
        status: str = "",
        limit: int = MCP_LIST_DEFAULT_LIMIT,
    ) -> list[dict]:
        """List production BOMs (Template records). A BOM is the versioned parts list for a production.

        Args:
            production_id: Optional UUID to filter by production project.
            series_kind: Optional filter — 'template' (imported netlist reference) or 'working'
                (editable, used for actual production runs).
            status: Optional filter — draft, in_progress, or locked.
            limit: Maximum number of results (default 200, max 500).
        """
        _require_read(self.request)

        qs = Template.objects.select_related("production").all()
        if production_id:
            qs = qs.filter(production_id=production_id)
        if series_kind:
            qs = qs.filter(series_kind=series_kind)
        if status:
            qs = qs.filter(status=status)

        row_limit = _clamp_list_limit(limit)
        return MCPBomListSerializer(qs.order_by("-created_at")[:row_limit], many=True).data

    def get_bom(self, bom_id: str) -> dict:
        """Get full detail of a production BOM, including its component lines.

        Args:
            bom_id: UUID of the BOM (Template).
        """
        _require_read(self.request)

        template = Template.objects.select_related("production", "locked_by").prefetch_related(
            "components__component",
        ).get(id=bom_id)
        return MCPBomDetailSerializer(template).data

    def get_bom_availability(self, bom_id: str) -> dict:
        """Get stock availability per BOM line: needed quantity, in-stock quantity, and shortages.

        Shortage accounts for reservations held by other BOMs (self-reservations for this
        BOM do not count against its own availability).

        Args:
            bom_id: UUID of the BOM (Template).
        """
        _require_read(self.request)

        template = Template.objects.get(id=bom_id)
        rows = bom_availability_rows(template)
        return {
            "bom_id": str(template.id),
            "qty_planned": template.qty_planned,
            "rows": rows,
        }


class ProductionWriteToolset(MCPToolset):
    """Write tools for controlling a production BOM."""

    def update_bom(
        self,
        bom_id: str,
        name: str = "",
        description: str = "",
        qty_planned: int | None = None,
        planned_date: str | None = None,
    ) -> dict:
        """Update editable fields of a BOM. Only provided fields are changed. Fails if the BOM is locked.

        Args:
            bom_id: UUID of the BOM (Template).
            name: New name (leave empty to keep current).
            description: New description (leave empty to keep current).
            qty_planned: New planned board quantity (leave None to keep current).
            planned_date: New planned date as YYYY-MM-DD (leave None to keep current).
        """
        _require_write(self.request)

        template = Template.objects.select_related("production").get(id=bom_id)
        _ensure_bom_editable(template)

        update_fields = []
        if name:
            template.name = name
            update_fields.append("name")
        if description:
            template.description = description
            update_fields.append("description")
        if qty_planned is not None:
            if qty_planned < 1:
                raise ValueError("qty_planned must be at least 1.")
            template.qty_planned = qty_planned
            update_fields.append("qty_planned")
        if planned_date is not None:
            template.planned_date = planned_date or None
            update_fields.append("planned_date")

        if update_fields:
            template.save(update_fields=update_fields)

        return MCPBomListSerializer(template).data

    def set_bom_line_component(
        self,
        line_id: str,
        component_id: str = "",
        refs: list[str] | None = None,
    ) -> dict:
        """Link (or relink) a warehouse component to a BOM line, optionally for only a subset
        of designators. Assigning a subset of refs splits those designators off into a new line;
        assigning a component that already has a line in the same BOM merges the refs into that
        line. To clear a wrongly-linked component instead of relinking, use
        unlink_bom_line_component — leaving component_id empty here does not unlink.

        Args:
            line_id: UUID of the BOM line (TemplateComponent).
            component_id: UUID of the warehouse component to link. Required to actually relink;
                if omitted, the whole line is left unchanged, and a subset of refs is split off
                into a new line keeping the current component.
            refs: Optional subset of designators (e.g. ['R1', 'R2']) this applies to.
                Omit to apply to the whole line.
        """
        _require_write(self.request)

        line = TemplateComponent.objects.select_related("template", "component").get(id=line_id)
        _ensure_bom_editable(line.template)

        component = Component.objects.get(id=component_id) if component_id else None
        with transaction.atomic():
            result_line, merged = assign_component_to_refs(line, component, refs)

        return {"line": MCPBomLineSerializer(result_line).data, "merged": merged}

    def unlink_bom_line_component(self, line_id: str) -> dict:
        """Clear the linked component from a BOM line, leaving it unlinked (empty).

        Use this when the currently linked component was wrongly chosen and there is
        no correct replacement to link yet — an empty line is preferable to one
        pointing at the wrong component, since availability, scanning, and finalize
        all key off the linked component.

        Args:
            line_id: UUID of the BOM line (TemplateComponent).
        """
        _require_write(self.request)

        line = TemplateComponent.objects.select_related("template", "component").get(id=line_id)
        _ensure_bom_editable(line.template)

        with transaction.atomic():
            result_line = unlink_component(line)

        return {"line": MCPBomLineSerializer(result_line).data}

    def lock_bom(self, bom_id: str) -> dict:
        """Lock a BOM, freezing it against further edits. Does not consume stock — use finalize_bom
        for that.

        Args:
            bom_id: UUID of the BOM (Template).
        """
        _require_write(self.request)

        template = Template.objects.get(id=bom_id)
        if template.status in CLOSED_TEMPLATE_STATUSES:
            raise ValueError("BOM is already locked or finished.")

        template.status = "locked"
        template.locked_at = timezone.now()
        template.locked_by = _mcp_actor_user(self.request)
        template.save(update_fields=["status", "locked_at", "locked_by"])
        return {"success": True, "bom_id": str(template.id), "status": template.status}

    def finalize_bom(self, bom_id: str, actual_used: list[dict] | None = None) -> dict:
        """Finalize a BOM: irreversibly consumes warehouse stock (FIFO) for every non-DNP line
        and marks the BOM as finished. Defaults each line's consumed quantity to its needed total
        (qty_per_board * qty_planned, or qty_override_total if set); pass actual_used to override
        specific lines. Consumption may drive a packet count negative when book stock is
        insufficient; fails only when a line has no linked component (or a component with no
        packet to attach the deduction to), and then nothing is consumed.

        Args:
            bom_id: UUID of the BOM (Template).
            actual_used: Optional overrides, each an object with 'line_id' (BOM line UUID) and
                'qty' (actual quantity consumed), for lines that used less/more than the default
                needed total.
        """
        _require_write(self.request)

        template = Template.objects.get(id=bom_id)
        if template.status in CLOSED_TEMPLATE_STATUSES:
            raise ValueError("BOM is already finalized.")

        actual_used_map = {}
        for index, entry in enumerate(actual_used or []):
            if not isinstance(entry, dict) or not entry.get("line_id"):
                raise ValueError(f"actual_used[{index}] must be an object with a line_id.")
            actual_used_map[str(entry["line_id"])] = entry.get("qty")

        actor = _mcp_actor_user(self.request)

        with transaction.atomic():
            errors = []
            for line in template.components.select_related("component").all().order_by("position", "id"):
                if line.dnp:
                    continue

                needed_total = line_needed_total(line, template.qty_planned)
                override = actual_used_map.get(str(line.id))
                used = safe_float(override if override is not None else float(needed_total))
                if used <= 0:
                    continue

                if not line.component:
                    errors.append(f"Line '{line.value or line.ref_group or line.id}' is not linked to a component.")
                    continue

                try:
                    consume_component(
                        component=line.component,
                        qty=used,
                        reference=template.id,
                        user=actor,
                        description=f"Manufacturing finalize (MCP): {template.name}",
                    )
                except ValueError as exc:
                    errors.append(str(exc))

            if errors:
                raise ValueError("Finalize failed: " + "; ".join(errors))

            template.status = "finished"
            template.locked_at = timezone.now()
            template.locked_by = actor
            template.save(update_fields=["status", "locked_at", "locked_by"])

        return {"success": True, "bom_id": str(template.id), "status": template.status}
