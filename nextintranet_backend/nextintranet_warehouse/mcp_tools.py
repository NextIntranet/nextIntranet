from mcp_server import MCPToolset
from rest_framework.exceptions import PermissionDenied

from django.db.models import Q, Sum

from nextintranet_backend.models.serviceToken import ServiceToken
from nextintranet_warehouse.models.component import (
    Component, ComponentParameter, ParameterType,
)
from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.warehouse import Warehouse
from nextintranet_warehouse.mcp_serializers import (
    MCPComponentListSerializer,
    MCPComponentDetailSerializer,
    MCPInventoryItemSerializer,
    MCPCategorySerializer,
    MCPLocationSerializer,
    MCPParameterTypeSerializer,
)
from nextintranet_warehouse.services.parameter_values import coerce_decimal_for_storage


def _has_scope(request, *scopes):
    """Check if the authenticated service token has any of the given scopes."""
    token = getattr(request, "auth", None)
    if token is None or not isinstance(token, ServiceToken):
        return False
    token_scopes = set(token.scopes or [])
    if ServiceToken.SCOPE_API_ALL in token_scopes:
        return True
    return bool(token_scopes & set(scopes))


def _require_read(request):
    if not _has_scope(request, ServiceToken.SCOPE_MCP_READ, ServiceToken.SCOPE_MCP_WRITE):
        raise PermissionDenied("Requires mcp:read or mcp:write scope.")


def _require_write(request):
    if not _has_scope(request, ServiceToken.SCOPE_MCP_WRITE):
        raise PermissionDenied("Requires mcp:write scope.")


def _normalize_boolean_value(raw_value):
    normalized = str(raw_value).strip().lower()
    if normalized in {"true", "1", "yes", "on"}:
        return "true"
    if normalized in {"false", "0", "no", "off"}:
        return "false"
    return None


class WarehouseReadToolset(MCPToolset):
    """Read-only tools for warehouse data access."""

    def search_components(
        self,
        query: str = "",
        category: str = "",
        tag: str = "",
        location: str = "",
        limit: int = 25,
    ) -> list[dict]:
        """Search components by name, description, category slug, tag name, or location UUID.

        Args:
            query: Text search across name and description.
            category: Filter by category slug (abbreviation).
            tag: Filter by tag name.
            location: Filter by location UUID (returns components stored there).
            limit: Maximum number of results (default 25, max 100).
        """
        _require_read(self.request)

        qs = Component.objects.select_related("category").prefetch_related("tags").all()

        if query:
            qs = qs.filter(Q(name__icontains=query) | Q(description__icontains=query))
        if category:
            qs = qs.filter(category__abbreviation=category)
        if tag:
            qs = qs.filter(tags__name=tag)
        if location:
            qs = qs.filter(packets__location__uuid=location, packets__is_active=True).distinct()

        limit = min(max(limit, 1), 100)
        qs = qs[:limit]

        return MCPComponentListSerializer(qs, many=True).data

    def get_component_detail(self, component_id: str) -> dict:
        """Get full detail of a component including parameters, documents, packets, and suppliers.

        Args:
            component_id: UUID of the component.
        """
        _require_read(self.request)

        component = Component.objects.select_related("category").prefetch_related(
            "tags", "parameters__parameter_type", "documents",
            "packets__location", "suppliers__supplier",
        ).get(id=component_id)

        return MCPComponentDetailSerializer(component).data

    def get_inventory_summary(
        self,
        category: str = "",
        low_stock_only: bool = False,
    ) -> list[dict]:
        """Get inventory summary with quantities, reservations, and locations.

        Args:
            category: Optional category slug to filter by.
            low_stock_only: If true, only return components with quantity <= 0.
        """
        _require_read(self.request)

        qs = Component.objects.select_related("category").prefetch_related(
            "packets__location", "reservations",
        ).all()

        if category:
            qs = qs.filter(category__abbreviation=category)

        results = MCPInventoryItemSerializer(qs[:200], many=True).data

        if low_stock_only:
            results = [r for r in results if r["quantity"] <= 0]

        return results

    def list_categories(self) -> list[dict]:
        """List all component categories in a tree structure."""
        _require_read(self.request)

        root_nodes = Category.objects.root_nodes()
        return MCPCategorySerializer(root_nodes, many=True).data

    def list_locations(self) -> list[dict]:
        """List all warehouse locations in a tree structure."""
        _require_read(self.request)

        root_nodes = Warehouse.objects.root_nodes()
        return MCPLocationSerializer(root_nodes, many=True).data

    def list_parameter_types(self, query: str = "") -> list[dict]:
        """List all available parameter types. Optionally filter by name.

        Args:
            query: Optional text to filter parameter types by name.
        """
        _require_read(self.request)

        qs = ParameterType.objects.all().order_by("name")
        if query:
            qs = qs.filter(name__icontains=query)
        return MCPParameterTypeSerializer(qs, many=True).data


class WarehouseWriteToolset(MCPToolset):
    """Write tools for warehouse data modification."""

    def update_component_description(
        self,
        component_id: str,
        description: str,
    ) -> dict:
        """Update the description of a component.

        Args:
            component_id: UUID of the component to update.
            description: New description text (markdown supported).
        """
        _require_write(self.request)

        component = Component.objects.get(id=component_id)
        component.description = description
        component.save(update_fields=["description"])

        return {"id": str(component.id), "name": component.name, "description": component.description}

    def set_component_parameters(
        self,
        component_id: str,
        parameters: list[dict],
    ) -> list[dict]:
        """Set parameters on a component. Each parameter dict should have 'parameter_type_id' and 'value'.

        Args:
            component_id: UUID of the component.
            parameters: List of dicts with 'parameter_type_id' (UUID) and 'value' (string).
        """
        _require_write(self.request)

        component = Component.objects.get(id=component_id)
        results = []

        for param in parameters:
            pt_id = param.get("parameter_type_id")
            value = param.get("value", "")

            parameter_type = ParameterType.objects.get(id=pt_id)
            if parameter_type.value_type == "number":
                coerce_decimal_for_storage(value, strict=True)
            elif parameter_type.value_type == "bool":
                normalized_bool = _normalize_boolean_value(value)
                if normalized_bool is None:
                    raise ValueError("Expected a boolean value: true/false.")
                value = normalized_bool

            cp, created = ComponentParameter.objects.update_or_create(
                component=component,
                parameter_type=parameter_type,
                defaults={"value": value},
            )
            results.append({
                "id": str(cp.id),
                "parameter_name": parameter_type.name,
                "value": cp.value,
                "created": created,
            })

        return results

    def create_parameter_type(
        self,
        name: str,
        unit: str = "",
        value_type: str = "text",
        description: str = "",
        format_with_si_prefix: bool = False,
    ) -> dict:
        """Create a new parameter type for components.

        Args:
            name: Unique name of the parameter type.
            unit: Optional unit of measurement (e.g. 'V', 'A', 'Ohm').
            value_type: Type of value - 'text', 'number', or 'bool'. Default 'text'.
            description: Optional description of the parameter type.
            format_with_si_prefix: Enable SI prefix formatting for number values.
        """
        _require_write(self.request)

        pt = ParameterType.objects.create(
            name=name,
            unit=unit or None,
            value_type=value_type,
            description=description or None,
            format_with_si_prefix=format_with_si_prefix,
        )
        return MCPParameterTypeSerializer(pt).data

    def update_parameter_type(
        self,
        parameter_type_id: str,
        name: str = "",
        unit: str = "",
        value_type: str = "",
        description: str = "",
        format_with_si_prefix: bool | None = None,
    ) -> dict:
        """Update an existing parameter type.

        Args:
            parameter_type_id: UUID of the parameter type to update.
            name: New name (leave empty to keep current).
            unit: New unit (leave empty to keep current).
            value_type: New value type - 'text', 'number', or 'bool' (leave empty to keep current).
            description: New description (leave empty to keep current).
            format_with_si_prefix: Set SI prefix formatting flag (leave None to keep current).
        """
        _require_write(self.request)

        pt = ParameterType.objects.get(id=parameter_type_id)
        if name:
            pt.name = name
        if unit:
            pt.unit = unit
        if value_type:
            pt.value_type = value_type
        if description:
            pt.description = description
        if format_with_si_prefix is not None:
            pt.format_with_si_prefix = format_with_si_prefix
        pt.save()
        return MCPParameterTypeSerializer(pt).data

    def create_component(
        self,
        name: str,
        description: str = "",
        category_id: str = "",
        unit_type: str = "int",
    ) -> dict:
        """Create a new component.

        Args:
            name: Name of the component.
            description: Optional description (markdown).
            category_id: Optional UUID of the category.
            unit_type: Unit type - 'int' (integer) or 'float'. Default 'int'.
        """
        _require_write(self.request)

        kwargs = {
            "name": name,
            "description": description,
            "unit_type": unit_type,
        }

        if category_id:
            kwargs["category"] = Category.objects.get(id=category_id)

        component = Component.objects.create(**kwargs)

        return {
            "id": str(component.id),
            "name": component.name,
            "description": component.description,
            "unit_type": component.unit_type,
            "category": str(component.category_id) if component.category_id else None,
        }
