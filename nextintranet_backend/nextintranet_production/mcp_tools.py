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
from nextintranet_warehouse.services.availability import (
    default_warehouse_for_user,
    warehouses as availability_warehouses,
)
from nextintranet_production.services.requests import request_line, request_missing
from nextintranet_production.services.reservations import reserve_bom, unreserve_bom
from nextintranet_production.services.bom import (
    bom_availability_rows,
    assign_component_to_refs,
    unlink_component,
    line_needed_total,
    line_deducted_total,
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
        """Get stock availability per BOM line in the BOM's warehouse.

        Per line: needed_total, placed_total, remaining (still to place), in_stock (what this
        line can use in the BOM's warehouse), `here` (on_hand / reserved_by_others / free),
        `elsewhere` (other warehouses with free stock, informational only) and status
        ok / elsewhere / missing / unlinked. Reservations held by anything else — other BOMs,
        other lines, manual reservations — count against the line; its own hold does not.

        Args:
            bom_id: UUID of the BOM (Template).
        """
        _require_read(self.request)

        template = Template.objects.get(id=bom_id)
        warehouse_id = template.stock_warehouse_id or default_warehouse_for_user(_mcp_actor_user(self.request))
        rows = bom_availability_rows(template, warehouse_id=warehouse_id)
        return {
            "bom_id": str(template.id),
            "qty_planned": template.qty_planned,
            "warehouse_id": str(warehouse_id) if warehouse_id else None,
            "warehouses": list(availability_warehouses().values()),
            "reserved": template.holds_stock,
            "rows": rows,
        }


class ProductionWriteToolset(MCPToolset):
    """Write tools for controlling a production BOM."""

    def reserve_bom(self, bom_id: str, warehouse_id: str = "") -> dict:
        """Reserve a BOM: it then holds its remaining parts (needed − placed per line) in its
        warehouse until it is finished or unreserved. Nothing is copied — the hold follows the BOM.

        Args:
            bom_id: UUID of the BOM (Template).
            warehouse_id: Warehouse to draw parts from (location UUID with is_warehouse). Optional
                when the BOM already has one or there is a single warehouse.
        """
        _require_write(self.request)

        template = Template.objects.get(id=bom_id)
        reserve_bom(template, _mcp_actor_user(self.request), warehouse_id or None)
        return {
            "bom_id": str(template.id),
            "reserved": template.holds_stock,
            "reserved_at": template.reserved_at.isoformat() if template.reserved_at else None,
            "stock_warehouse_id": str(template.stock_warehouse_id) if template.stock_warehouse_id else None,
        }

    def request_bom_line(
        self,
        line_id: str,
        quantity: int | None = None,
        target_location_id: str = "",
    ) -> dict:
        """Create or update the open purchase request for parts a BOM line is missing.

        Args:
            line_id: UUID of the BOM line (TemplateComponent).
            quantity: Quantity to request. Defaults to the shortage in the BOM's warehouse minus
                what is already ordered for the line.
            target_location_id: Warehouse or storage position (location UUID) the parts should end
                up in. Defaults to the BOM's warehouse.
        """
        _require_write(self.request)

        line = TemplateComponent.objects.select_related("template__production").get(id=line_id)
        request = request_line(line, _mcp_actor_user(self.request), quantity, target_location_id or None)
        return {
            "request_id": str(request.id),
            "quantity": request.quantity,
            "target_location_id": str(request.target_location_id) if request.target_location_id else None,
        }

    def request_missing_bom_parts(self, bom_id: str) -> dict:
        """Create or update purchase requests for every BOM line short in the BOM's warehouse.

        Args:
            bom_id: UUID of the BOM (Template).
        """
        _require_write(self.request)

        template = Template.objects.select_related("production").get(id=bom_id)
        created = request_missing(template, _mcp_actor_user(self.request))
        return {"bom_id": str(template.id), "requested": len(created), "request_ids": [str(r.id) for r in created]}

    def unreserve_bom(self, bom_id: str) -> dict:
        """Release a BOM's hold on stock.

        Args:
            bom_id: UUID of the BOM (Template).
        """
        _require_write(self.request)

        template = Template.objects.get(id=bom_id)
        unreserve_bom(template)
        return {"bom_id": str(template.id), "reserved": False}

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
        """Lock a BOM, freezing it against further edits and against returning placed stock.

        Does not consume stock: warehouse stock is deducted when a component is scanned as placed
        during assembly, not on lock or finalize.

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

    def finalize_bom(self, bom_id: str) -> dict:
        """Finalize a BOM: mark it finished and close it for any further edits or stock returns.

        Consumes no stock. Warehouse stock is deducted per bag at the moment a component is
        scanned as placed during assembly, and can be returned by removing that scan while the
        BOM is still open. Returns a per-line summary of needed / placed / already deducted
        quantities plus the lines that were never fully placed — those were never booked out of
        the warehouse at all.

        Args:
            bom_id: UUID of the BOM (Template).
        """
        _require_write(self.request)

        template = Template.objects.get(id=bom_id)
        if template.status in CLOSED_TEMPLATE_STATUSES:
            raise ValueError("BOM is already finalized.")

        actor = _mcp_actor_user(self.request)

        with transaction.atomic():
            summary = []
            not_fully_placed = []
            lines = (
                template.components.select_related("component")
                .prefetch_related("scans__stock_operation")
                .order_by("position", "id")
            )
            for line in lines:
                if line.dnp:
                    continue

                needed_total = float(line_needed_total(line, template.qty_planned))
                placed_total = safe_float(line.placed_total)
                summary.append(
                    {
                        "line_id": str(line.id),
                        "ref_group": line.ref_group,
                        "needed_total": needed_total,
                        "placed_total": placed_total,
                        "deducted_total": line_deducted_total(line),
                    }
                )
                if placed_total < needed_total:
                    not_fully_placed.append(str(line.id))

            template.status = "finished"
            template.locked_at = timezone.now()
            template.locked_by = actor
            template.save(update_fields=["status", "locked_at", "locked_by"])

        return {
            "success": True,
            "bom_id": str(template.id),
            "status": template.status,
            "lines": summary,
            "lines_not_fully_placed": not_fully_placed,
        }
