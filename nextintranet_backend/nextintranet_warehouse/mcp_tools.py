from datetime import date
from decimal import Decimal, InvalidOperation

from mcp_server import MCPToolset
from rest_framework.exceptions import PermissionDenied

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Sum

from nextintranet_backend.models.serviceToken import ServiceToken
from nextintranet_backend.models.printList import PrintList, PrintItem
from nextintranet_backend.services.print_list import create_print_list
from nextintranet_warehouse.models.component import (
    Component, ComponentParameter, ParameterType, Packet, PacketState, StockOperation, Tag,
    Supplier, SupplierRelation, Reservation, Document,
)
from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.purchase import (
    Purchase, PurchaseDelivery, PurchaseItem, PurchaseItemType, PurchaseRequest, PurchaseStatus,
)
from nextintranet_warehouse.models.warehouse import Warehouse
from nextintranet_warehouse.services import purchase as purchase_service
from nextintranet_warehouse.mcp_serializers import (
    MCPComponentListSerializer,
    MCPComponentDetailSerializer,
    MCPInventoryItemSerializer,
    MCPCategorySerializer,
    MCPCategoryFlatSerializer,
    MCPLocationSerializer,
    MCPLocationFlatSerializer,
    MCPParameterTypeSerializer,
    MCPSupplierSerializer,
    MCPSupplierRelationSerializer,
    MCPReservationSerializer,
    MCPPacketSerializer,
    MCPDocumentSerializer,
    MCPPrintQueueSerializer,
    MCPPrintQueueItemSerializer,
    MCPPurchaseListSerializer,
    MCPPurchaseDetailSerializer,
    MCPPurchaseItemSerializer,
    MCPPurchaseDeliverySerializer,
    MCPPurchaseRequestSerializer,
)
from nextintranet_warehouse.services.parameter_values import coerce_decimal_for_storage

MCP_DESCRIPTION_LINK_GUIDANCE = (
    "Do not put URLs in the component description. Add external links as component "
    "documents (use create_component_document) with an appropriate doc_type such as "
    "product_page, datasheet, or manual."
)


def _mcp_doc_append_description_guidance(doc: str, *, on_new_line: bool = False) -> str:
    if on_new_line:
        return doc.rstrip() + "\n                " + MCP_DESCRIPTION_LINK_GUIDANCE
    return doc.rstrip() + " " + MCP_DESCRIPTION_LINK_GUIDANCE

DOCUMENT_TYPE_KEYS = {choice[0] for choice in Document.DOCUMENT_TYPE_CHOICES}


def _serialize_mcp_document(document: Document, *, component_id=None) -> dict:
    """JSON-safe document payload for MCP (no lazy translation objects)."""
    payload = dict(MCPDocumentSerializer(document).data)
    payload["component_id"] = str(component_id if component_id is not None else document.component_id)
    return payload


def _normalize_doc_type(raw: str, *, default: str = "product_page") -> str:
    """Accept type keys (product_page) or labels (Product page)."""
    value = (raw or default).strip() or default
    if value in DOCUMENT_TYPE_KEYS:
        return value
    slug = value.lower().replace(" ", "_").replace("-", "_")
    if slug in DOCUMENT_TYPE_KEYS:
        return slug
    for key, label in Document.DOCUMENT_TYPE_CHOICES:
        if value.lower() == str(label).lower():
            return key
    allowed = ", ".join(sorted(DOCUMENT_TYPE_KEYS))
    raise ValueError(
        f"Invalid doc_type '{raw}'. Use a type key (e.g. product_page), not the display label. "
        f"Allowed keys: {allowed}. Call list_document_types for keys and labels."
    )


def _set_document_primary(document: Document) -> None:
    if document.doc_type != "image":
        raise ValueError("Only image documents can be set as the primary image.")
    Document.objects.filter(component_id=document.component_id, is_primary=True).exclude(
        pk=document.pk
    ).update(is_primary=False)
    if not document.is_primary:
        document.is_primary = True
        document.save(update_fields=["is_primary"])


MCP_LIST_DEFAULT_LIMIT = 500
MCP_LIST_MAX_LIMIT = 2000


def _clamp_list_limit(limit: int, default: int = MCP_LIST_DEFAULT_LIMIT, maximum: int = MCP_LIST_MAX_LIMIT) -> int:
    if limit <= 0:
        return default
    return min(max(limit, 1), maximum)


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


def _mcp_actor_name(request):
    token = getattr(request, "auth", None)
    if isinstance(token, ServiceToken):
        return f"MCP:{token.name}"
    return "MCP"


def _validate_reservation_sources(sources):
    if not isinstance(sources, list):
        raise ValueError("sources must be a list.")
    for i, item in enumerate(sources):
        if not isinstance(item, dict):
            raise ValueError(f"sources[{i}] must be an object.")
        if "type" not in item:
            raise ValueError(f"sources[{i}] must have a 'type' key.")
    return sources


def _get_parent(model, parent_id: str):
    if not parent_id:
        return None
    return model.objects.get(id=parent_id)


def _resolve_location(location_ref: str):
    """Resolve a warehouse location by UUID primary key or legacy uuid field."""
    try:
        return Warehouse.objects.get(id=location_ref)
    except Warehouse.DoesNotExist:
        return Warehouse.objects.get(uuid=location_ref)


def _require_storage_location(location_ref: str) -> Warehouse:
    location = _resolve_location(location_ref)
    if not location.can_store_items:
        raise ValueError("Location cannot store items (can_store_items is false).")
    return location


def _normalize_packet_state(raw: str) -> str:
    value = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if value not in PacketState.values:
        allowed = ", ".join(PacketState.values)
        raise ValueError(f"Invalid packet state '{raw}'. Use one of: {allowed}.")
    return value


def _mcp_actor_user(request):
    """Resolve the Django user behind the service token, if any (for author/received_by FKs)."""
    token = _mcp_service_token(request)
    if token and token.created_by and token.created_by.is_active:
        return token.created_by
    return None


def _resolve_purchase(purchase_id: str) -> Purchase:
    return Purchase.objects.select_related("supplier").prefetch_related("items").get(id=purchase_id)


def _parse_date(raw: str, field_name: str) -> date | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"Invalid {field_name} '{raw}'. Use ISO format YYYY-MM-DD.")


def _domain_error(exc: DjangoValidationError) -> ValueError:
    """Turn a Django ValidationError into the flat ValueError MCP tools report."""
    return ValueError("; ".join(exc.messages))


def _purchase_price(raw_value, field_name: str) -> Decimal:
    try:
        return Decimal(str(raw_value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"Invalid {field_name} '{raw_value}'.")


def _apply_purchase_item(purchase: Purchase, raw: dict) -> PurchaseItem:
    """Create or update one purchase line from an MCP payload dict.

    Mirrors the normalisation the REST write serializer applies, so both entry
    points produce the same rows.
    """
    item_id = raw.get("item_id")
    item = None
    if item_id is not None:
        item = PurchaseItem.objects.filter(purchase=purchase, id=item_id).first()
        if item is None:
            raise ValueError(f"purchase item {item_id} not found in this purchase.")

    item_type = (raw.get("item_type") or (item.item_type if item else PurchaseItemType.COMPONENT)).strip()
    if item_type not in PurchaseItemType.values:
        allowed = ", ".join(PurchaseItemType.values)
        raise ValueError(f"Invalid item_type '{item_type}'. Use one of: {allowed}.")

    if item is None:
        item = PurchaseItem(purchase=purchase, quantity=0)
    item.item_type = item_type

    if item_type == PurchaseItemType.COMPONENT:
        if raw.get("supplier_relation_id"):
            relation = SupplierRelation.objects.select_related("component", "supplier").get(
                id=raw["supplier_relation_id"]
            )
            if relation.supplier_id != purchase.supplier_id:
                raise ValueError("Supplier relation does not match purchase supplier.")
            item.supplier_relation = relation
            if not raw.get("component_id"):
                item.component = relation.component
        if raw.get("component_id"):
            item.component = Component.objects.get(id=raw["component_id"])
        if item.component is None:
            raise ValueError("Component item requires component_id or supplier_relation_id.")
        if item.supplier_relation and item.supplier_relation.component_id != item.component_id:
            raise ValueError("Supplier relation does not match selected component.")

        symbol = (raw.get("symbol") or item.symbol or "").strip()
        if not symbol:
            symbol = (item.supplier_relation.symbol if item.supplier_relation else "") or item.component.name
        item.symbol = symbol
        item.name = ""

        if raw.get("stock_location_id"):
            item.stock_location = _require_storage_location(raw["stock_location_id"])
    else:
        name = (raw.get("name") or item.name or "").strip()
        if not name:
            raise ValueError("Non-stock item requires name.")
        item.name = name
        item.component = None
        item.supplier_relation = None
        item.stock_location = None
        item.symbol = (raw.get("symbol") or item.symbol or name).strip()

    if "description" in raw:
        item.description = raw.get("description") or ""
    if raw.get("quantity") is not None:
        item.quantity = int(raw["quantity"])
    if item.quantity is None or item.quantity <= 0:
        raise ValueError("quantity must be greater than zero.")
    if raw.get("requested_quantity") is not None:
        item.requested_quantity = int(raw["requested_quantity"])
    if raw.get("package_size") is not None:
        package_size = int(raw["package_size"])
        if package_size <= 0:
            raise ValueError("package_size must be greater than zero.")
        item.package_size = package_size
    if raw.get("unit_price_original") is not None:
        item.unit_price_original = _purchase_price(raw["unit_price_original"], "unit_price_original")
        item.unit_price_converted = item.unit_price_original
    if raw.get("unit_price_converted") is not None:
        item.unit_price_converted = _purchase_price(raw["unit_price_converted"], "unit_price_converted")

    item.is_fully_delivered = item.delivered_quantity >= item.quantity
    item.full_clean()
    item.save()
    return item


def _resolve_tags(tag_names: list[str]) -> list[Tag]:
    tags = []
    for raw_name in tag_names:
        name = raw_name.strip()
        if not name:
            continue
        tag, _ = Tag.objects.get_or_create(name=name)
        tags.append(tag)
    return tags


_STOCK_OPERATION_TYPES = frozenset({
    "add", "remove", "adjust", "trans_in", "trans_out",
    "inventory", "service", "buy", "sell",
})


def _normalize_stock_quantity(operation_type: str, quantity: float) -> float:
    if quantity == 0:
        raise ValueError("quantity must not be zero.")
    if operation_type in {"remove", "trans_out", "sell"}:
        return -abs(quantity)
    if operation_type in {"add", "trans_in", "buy"}:
        return abs(quantity)
    return quantity


_PRINT_TARGET_TYPES = {
    "packet": Packet,
    "location": Warehouse,
    "component": Component,
}


def _mcp_service_token(request):
    token = getattr(request, "auth", None)
    if isinstance(token, ServiceToken):
        return token
    return None


def _mcp_print_queue_user(request):
    token = _mcp_service_token(request)
    if token and token.created_by and token.created_by.is_active:
        return token.created_by
    return None


def _mcp_print_queues_queryset(request):
    token = _mcp_service_token(request)
    if token and token.allowed_print_lists.exists():
        return token.allowed_print_lists.all().order_by("-is_default", "name")

    user = _mcp_print_queue_user(request)
    if not user:
        return PrintList.objects.none()

    return (
        PrintList.objects.filter(owner=user)
        | PrintList.objects.filter(is_public=True)
    ).distinct().order_by("-is_default", "name")


def _resolve_mcp_print_queue(request, queue_id: str = ""):
    queues = _mcp_print_queues_queryset(request)
    if queue_id:
        return queues.filter(id=queue_id).first()

    default = queues.filter(is_default=True).first()
    if default:
        return default
    return queues.first()


def _resolve_print_target(target_type: str, target_id: str):
    model = _PRINT_TARGET_TYPES.get(target_type)
    if not model:
        allowed = ", ".join(sorted(_PRINT_TARGET_TYPES))
        raise ValueError(f"Invalid target_type '{target_type}'. Use one of: {allowed}.")

    if target_type == "location":
        try:
            return Warehouse.objects.get(id=target_id)
        except Warehouse.DoesNotExist:
            return Warehouse.objects.get(uuid=target_id)

    return model.objects.get(id=target_id)


def _create_print_queue_item(queue, target, *, kind: str = "label", payload: dict | None = None) -> PrintItem:
    if kind not in dict(PrintItem.KIND_CHOICES):
        allowed = ", ".join(key for key, _label in PrintItem.KIND_CHOICES)
        raise ValueError(f"Invalid kind '{kind}'. Use one of: {allowed}.")

    return PrintItem.objects.create(
        print_list=queue,
        kind=kind,
        status=PrintItem.STATUS_QUEUED,
        content_object=target,
        payload=payload or {},
    )


def _component_summary(component: Component) -> dict:
    return {
        "id": str(component.id),
        "name": component.name,
        "description": component.description,
        "unit_type": component.unit_type,
        "category_id": str(component.category_id) if component.category_id else None,
        "tags": list(component.tags.values_list("name", flat=True)),
        "selling_price": component.selling_price,
        "internal_price": component.internal_price,
    }


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
        missing_internal_price: bool = False,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict]:
        """Get inventory summary with quantities, reservations, and locations.

        Args:
            category: Optional category slug to filter by.
            low_stock_only: If true, only return components with quantity <= 0.
            missing_internal_price: If true, only return components whose internal_price
                is zero or unset.
            limit: Maximum number of results (default 200, max 500).
            offset: Number of matching results to skip, for paging through more than
                `limit` results.
        """
        _require_read(self.request)

        qs = Component.objects.select_related("category").prefetch_related(
            "packets__location", "reservations",
        ).all()

        if category:
            qs = qs.filter(category__abbreviation=category)
        if missing_internal_price:
            qs = qs.filter(Q(internal_price__isnull=True) | Q(internal_price=0))

        row_limit = _clamp_list_limit(limit, default=200, maximum=500)
        offset = max(offset, 0)
        results = MCPInventoryItemSerializer(qs[offset:offset + row_limit], many=True).data

        if low_stock_only:
            results = [r for r in results if r["quantity"] <= 0]

        return results

    def list_categories(
        self,
        include_nested: bool = True,
        limit: int = MCP_LIST_DEFAULT_LIMIT,
    ) -> list[dict]:
        """List component categories.

        Args:
            include_nested: If true (default), return every category including nested ones
                as a flat list ordered by tree hierarchy. If false, return only root categories.
            limit: Maximum number of results (default 500, max 2000).
        """
        _require_read(self.request)

        row_limit = _clamp_list_limit(limit)
        if include_nested:
            categories = Category.objects.all().order_by("tree_id", "lft")[:row_limit]
            return MCPCategoryFlatSerializer(categories, many=True).data

        root_nodes = Category.objects.root_nodes()[:row_limit]
        return MCPCategoryFlatSerializer(root_nodes, many=True).data

    def list_locations(
        self,
        include_nested: bool = True,
        limit: int = MCP_LIST_DEFAULT_LIMIT,
    ) -> list[dict]:
        """List warehouse locations.

        Args:
            include_nested: If true (default), return every location including nested ones
                as a flat list ordered by tree hierarchy. If false, return only root locations.
            limit: Maximum number of results (default 500, max 2000).
        """
        _require_read(self.request)

        row_limit = _clamp_list_limit(limit)
        if include_nested:
            locations = Warehouse.objects.all().order_by("tree_id", "lft")[:row_limit]
            return MCPLocationFlatSerializer(locations, many=True).data

        root_nodes = Warehouse.objects.root_nodes()[:row_limit]
        return MCPLocationFlatSerializer(root_nodes, many=True).data

    def list_parameter_types(self, query: str = "", limit: int = MCP_LIST_DEFAULT_LIMIT) -> list[dict]:
        """List available parameter types. Optionally filter by name.

        Args:
            query: Optional text to filter parameter types by name.
            limit: Maximum number of results (default 500, max 2000).
        """
        _require_read(self.request)

        qs = ParameterType.objects.all().order_by("name")
        if query:
            qs = qs.filter(name__icontains=query)
        row_limit = _clamp_list_limit(limit)
        return MCPParameterTypeSerializer(qs[:row_limit], many=True).data

    def get_category(self, category_id: str, include_nested: bool = True) -> dict:
        """Get a single category.

        Args:
            category_id: UUID of the category.
            include_nested: If true (default), include nested subcategories in a tree under
                ``children``. If false, return only the category itself.
        """
        _require_read(self.request)
        category = Category.objects.get(id=category_id)
        if include_nested:
            return MCPCategorySerializer(category).data
        return MCPCategoryFlatSerializer(category).data

    def get_location(self, location_id: str, include_nested: bool = True) -> dict:
        """Get a single warehouse location.

        Args:
            location_id: UUID primary key or legacy location uuid field.
            include_nested: If true (default), include nested sub-locations in a tree under
                ``children``. If false, return only the location itself.
        """
        _require_read(self.request)
        location = _resolve_location(location_id)
        if include_nested:
            return MCPLocationSerializer(location).data
        return MCPLocationFlatSerializer(location).data

    def list_suppliers(self, query: str = "", limit: int = 50) -> list[dict]:
        """List suppliers. Optionally filter by name.

        Args:
            query: Optional text to filter suppliers by name.
            limit: Maximum number of results (default 50, max 200).
        """
        _require_read(self.request)

        qs = Supplier.objects.all().order_by("name")
        if query:
            qs = qs.filter(name__icontains=query)
        limit = min(max(limit, 1), 200)
        return MCPSupplierSerializer(qs[:limit], many=True).data

    def get_supplier(self, supplier_id: str) -> dict:
        """Get a single supplier by ID.

        Args:
            supplier_id: UUID of the supplier.
        """
        _require_read(self.request)
        supplier = Supplier.objects.get(id=supplier_id)
        return MCPSupplierSerializer(supplier).data

    def list_component_suppliers(self, component_id: str, limit: int = 50) -> list[dict]:
        """List supplier relations for a component.

        Args:
            component_id: UUID of the component.
            limit: Maximum number of results (default 50, max 200).
        """
        _require_read(self.request)
        row_limit = _clamp_list_limit(limit, default=50, maximum=200)
        relations = SupplierRelation.objects.filter(
            component_id=component_id,
        ).select_related("supplier", "component").order_by("supplier__name")[:row_limit]
        return MCPSupplierRelationSerializer(relations, many=True).data

    def list_reservations(
        self,
        component_id: str = "",
        search: str = "",
        limit: int = 50,
    ) -> list[dict]:
        """List component reservations.

        Args:
            component_id: Optional UUID to filter by component.
            search: Optional text search across component name, reserved_by, and description.
            limit: Maximum number of results (default 50, max 200).
        """
        _require_read(self.request)

        qs = Reservation.objects.select_related("component").order_by("-reservation_date")
        if component_id:
            qs = qs.filter(component_id=component_id)
        if search:
            qs = qs.filter(
                Q(component__name__icontains=search)
                | Q(reserved_by__icontains=search)
                | Q(description__icontains=search)
            )
        limit = min(max(limit, 1), 200)
        return MCPReservationSerializer(qs[:limit], many=True).data

    def get_reservation(self, reservation_id: str) -> dict:
        """Get a single reservation by ID.

        Args:
            reservation_id: UUID of the reservation.
        """
        _require_read(self.request)
        reservation = Reservation.objects.select_related("component").get(id=reservation_id)
        return MCPReservationSerializer(reservation).data

    def get_packet(self, packet_id: str) -> dict:
        """Get a single packet (stock batch) by ID.

        Args:
            packet_id: UUID of the packet.
        """
        _require_read(self.request)
        packet = Packet.objects.select_related("location", "component").get(id=packet_id)
        return MCPPacketSerializer(packet).data

    def list_component_packets(
        self,
        component_id: str,
        active_only: bool = False,
        limit: int = 100,
    ) -> list[dict]:
        """List packets for a component.

        Args:
            component_id: UUID of the component.
            active_only: If true, only return active packets.
            limit: Maximum number of results (default 100, max 500).
        """
        _require_read(self.request)
        qs = Packet.objects.filter(component_id=component_id).select_related("location", "component")
        if active_only:
            qs = qs.filter(is_active=True)
        row_limit = _clamp_list_limit(limit, default=100, maximum=500)
        return MCPPacketSerializer(qs.order_by("-date_added")[:row_limit], many=True).data

    def list_document_types(self) -> list[dict]:
        """List allowed component document types (keys and human-readable labels).

        Use the key (e.g. product_page) as doc_type when creating or updating documents.
        """
        _require_read(self.request)
        return [
            {"key": key, "label": str(label)}
            for key, label in Document.DOCUMENT_TYPE_CHOICES
        ]

    def list_component_documents(
        self,
        component_id: str,
        limit: int = 100,
    ) -> list[dict]:
        """List documents attached to a component.

        Args:
            component_id: UUID of the component.
            limit: Maximum number of results (default 100, max 500).
        """
        _require_read(self.request)
        row_limit = _clamp_list_limit(limit, default=100, maximum=500)
        qs = Document.objects.filter(component_id=component_id).order_by("-created_at")
        return [_serialize_mcp_document(doc, component_id=component_id) for doc in qs[:row_limit]]

    def get_component_document(self, document_id: str) -> dict:
        """Get a single component document by ID.

        Args:
            document_id: UUID of the document.
        """
        _require_read(self.request)
        document = Document.objects.select_related("component").get(id=document_id)
        return _serialize_mcp_document(document)

    def list_print_queues(self, limit: int = 50) -> list[dict]:
        """List print queues available to the MCP token.

        Uses the token creator's queues (and public queues), or queues explicitly
        allowed on the service token when configured.

        Args:
            limit: Maximum number of results (default 50, max 200).
        """
        _require_read(self.request)
        row_limit = _clamp_list_limit(limit, default=50, maximum=200)
        queues = _mcp_print_queues_queryset(self.request)[:row_limit]
        return MCPPrintQueueSerializer(queues, many=True).data

    def list_print_queue_items(
        self,
        print_list_id: str = "",
        limit: int = 100,
    ) -> list[dict]:
        """List items in a print queue.

        Args:
            print_list_id: Optional queue UUID. Uses the default queue when omitted.
            limit: Maximum number of results (default 100, max 500).
        """
        _require_read(self.request)

        queue = _resolve_mcp_print_queue(self.request, print_list_id)
        if not queue:
            raise ValueError("Print queue not found.")

        row_limit = _clamp_list_limit(limit, default=100, maximum=500)
        items = (
            PrintItem.objects.filter(print_list=queue)
            .select_related("content_type")
            .order_by("-created_at")[:row_limit]
        )
        return MCPPrintQueueItemSerializer(items, many=True).data

    # --- Purchases ---------------------------------------------------------- #

    def list_purchase_requests(
        self,
        assigned: bool | None = None,
        component_id: str = "",
        purchase_id: str = "",
        limit: int = 100,
    ) -> list[dict]:
        """List purchase requests (wishes to buy something, later grouped into a purchase).

        Args:
            assigned: True for requests already attached to a purchase, False for open ones.
            component_id: Filter by component UUID.
            purchase_id: Filter by purchase UUID.
            limit: Maximum number of results (default 100, max 500).
        """
        _require_read(self.request)

        qs = PurchaseRequest.objects.select_related("component", "requested_by").all()
        if assigned is True:
            qs = qs.filter(purchase__isnull=False)
        elif assigned is False:
            qs = qs.filter(purchase__isnull=True)
        if component_id:
            qs = qs.filter(component_id=component_id)
        if purchase_id:
            qs = qs.filter(purchase_id=purchase_id)

        row_limit = _clamp_list_limit(limit, default=100, maximum=500)
        return MCPPurchaseRequestSerializer(qs[:row_limit], many=True).data

    def get_purchase_request(self, request_id: str) -> dict:
        """Get a single purchase request.

        Args:
            request_id: UUID of the purchase request.
        """
        _require_read(self.request)
        obj = PurchaseRequest.objects.select_related("component", "requested_by").get(id=request_id)
        return MCPPurchaseRequestSerializer(obj).data

    def list_purchases(
        self,
        status: str = "",
        supplier_id: str = "",
        query: str = "",
        limit: int = 50,
    ) -> list[dict]:
        """List purchases (supplier orders).

        Args:
            status: Filter by status — draft, items_defined, priced, closed, exported,
                receiving, stocking or completed.
            supplier_id: Filter by supplier UUID.
            query: Text search across note and supplier name.
            limit: Maximum number of results (default 50, max 200).
        """
        _require_read(self.request)

        qs = Purchase.objects.select_related("supplier").all()
        if status:
            normalized = status.strip().lower()
            if normalized not in PurchaseStatus.values:
                allowed = ", ".join(PurchaseStatus.values)
                raise ValueError(f"Invalid status '{status}'. Use one of: {allowed}.")
            qs = qs.filter(status=normalized)
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        if query:
            qs = qs.filter(Q(note__icontains=query) | Q(supplier__name__icontains=query))

        row_limit = _clamp_list_limit(limit, default=50, maximum=200)
        return MCPPurchaseListSerializer(qs[:row_limit], many=True).data

    def get_purchase(self, purchase_id: str) -> dict:
        """Get a purchase with its items, deliveries and attached purchase requests.

        Args:
            purchase_id: UUID of the purchase.
        """
        _require_read(self.request)

        purchase = (
            Purchase.objects.select_related("supplier")
            .prefetch_related(
                "items__component",
                "items__stock_location",
                "items__draft_packet",
                "items__deliveries__stock_location",
                "requests__component",
            )
            .get(id=purchase_id)
        )
        return MCPPurchaseDetailSerializer(purchase).data

    def get_purchase_export_csv(self, purchase_id: str) -> dict:
        """Render the supplier import CSV (Mouser style) for a purchase.

        Args:
            purchase_id: UUID of the purchase.
        """
        _require_read(self.request)

        purchase = Purchase.objects.prefetch_related(
            "items__component__parameters__parameter_type",
        ).get(id=purchase_id)
        return {
            "purchase_id": str(purchase.id),
            "header": purchase_service.PURCHASE_EXPORT_HEADER,
            "rows": purchase_service.purchase_export_rows(purchase),
            "csv": purchase_service.purchase_export_csv(purchase),
        }


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
            description: New description text (plain line breaks preserved, no URLs).
        """
        _require_write(self.request)

        component = Component.objects.get(id=component_id)
        component.description = description
        component.save(update_fields=["description"])

        return _component_summary(component)

    def update_component(
        self,
        component_id: str,
        name: str = "",
        description: str = "",
        category_id: str = "",
        clear_category: bool = False,
        tags: list[str] | None = None,
        selling_price: float | None = None,
        internal_price: float | None = None,
        clear_selling_price: bool = False,
        clear_internal_price: bool = False,
    ) -> dict:
        """Update component fields. Only provided fields are changed.

        Args:
            component_id: UUID of the component.
            name: New name (leave empty to keep current).
            description: New description (leave empty to keep current).
            category_id: New category UUID (leave empty to keep current).
            clear_category: Set true to remove the category.
            tags: Tag names to set (replaces all tags). Omit to keep tags unchanged; pass [] to clear.
            selling_price: New selling price per unit (omit to keep current).
            internal_price: New internal price per unit (omit to keep current).
            clear_selling_price: Set true to clear selling price.
            clear_internal_price: Set true to clear internal price.
        """
        _require_write(self.request)

        component = Component.objects.prefetch_related("tags").get(id=component_id)
        update_fields = []

        if name:
            component.name = name
            update_fields.append("name")
        if description:
            component.description = description
            update_fields.append("description")
        if clear_category:
            component.category = None
            update_fields.append("category")
        elif category_id:
            component.category = Category.objects.get(id=category_id)
            update_fields.append("category")

        if tags is not None:
            component.tags.set(_resolve_tags(tags))

        if clear_selling_price:
            component.selling_price = None
            update_fields.append("selling_price")
        elif selling_price is not None:
            component.track_price_history("selling", selling_price)
            component.selling_price = selling_price
            update_fields.append("selling_price")

        if clear_internal_price:
            component.internal_price = None
            update_fields.append("internal_price")
        elif internal_price is not None:
            component.track_price_history("internal", internal_price)
            component.internal_price = internal_price
            update_fields.append("internal_price")

        if update_fields:
            component.save(update_fields=list(dict.fromkeys(update_fields)))

        component.refresh_from_db()
        return _component_summary(component)

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
            description: Optional description (line breaks preserved).
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

        return _component_summary(component)

    update_component_description.__doc__ = _mcp_doc_append_description_guidance(
        update_component_description.__doc__, on_new_line=True
    )
    update_component.__doc__ = _mcp_doc_append_description_guidance(update_component.__doc__)
    create_component.__doc__ = _mcp_doc_append_description_guidance(create_component.__doc__)

    def create_component_document(
        self,
        component_id: str,
        url: str,
        name: str = "",
        doc_type: str = "product_page",
        is_primary: bool = False,
    ) -> dict:
        """Create a URL document and attach it to a component (no file upload).

        Args:
            component_id: UUID of the component to attach the document to.
            url: External document URL (required). For doc_type image, use a direct image file URL
                (e.g. ending in .jpg or a CDN link that serves image/*), not an HTML product page.
            name: Optional display name (defaults from URL path if omitted).
            doc_type: Type key (product_page) or label (Product page). Default product_page.
            is_primary: Default false. For doc_type image only: true sets primary; the first image
                on a component is always made primary automatically.
        """
        _require_write(self.request)

        url = (url or "").strip()
        if not url:
            raise ValueError("url is required.")

        doc_type = _normalize_doc_type(doc_type)
        if is_primary and doc_type != "image":
            raise ValueError("is_primary can only be true when doc_type is image.")

        component = Component.objects.get(id=component_id)
        display_name = (name or "").strip()
        if not display_name:
            display_name = url.rstrip("/").split("/")[-1] or "Document"

        make_primary = False
        if doc_type == "image":
            has_other_images = Document.objects.filter(
                component_id=component.id,
                doc_type="image",
            ).exists()
            if is_primary or not has_other_images:
                make_primary = True

        document = Document.objects.create(
            component=component,
            name=display_name,
            url=url,
            doc_type=doc_type,
            access_level="public",
            is_primary=make_primary,
        )
        if make_primary:
            _set_document_primary(document)
        return _serialize_mcp_document(document)

    def update_component_document(
        self,
        document_id: str,
        name: str = "",
        url: str = "",
        doc_type: str = "",
        is_primary: bool = False,
    ) -> dict:
        """Update a component document. Only provided fields are changed.

        Args:
            document_id: UUID of the document.
            name: New display name (leave empty to keep current).
            url: New URL (leave empty to keep current). For image documents, use a direct image
                file URL, not an HTML page.
            doc_type: New type key or label (leave empty to keep current).
            is_primary: Set true to make this document the primary image (doc_type must be image).
        """
        _require_write(self.request)

        document = Document.objects.select_related("component").get(id=document_id)
        update_fields = []

        if name.strip():
            document.name = name.strip()
            update_fields.append("name")
        if url.strip():
            document.url = url.strip()
            update_fields.append("url")
        if doc_type.strip():
            document.doc_type = _normalize_doc_type(doc_type)
            update_fields.append("doc_type")

        if not update_fields and not is_primary:
            raise ValueError(
                "Provide at least one of name, url, doc_type, or set is_primary true."
            )

        if update_fields:
            document.save(update_fields=update_fields)

        if is_primary:
            _set_document_primary(document)

        document.refresh_from_db()
        return _serialize_mcp_document(document)

    def set_component_primary_document(self, document_id: str) -> dict:
        """Set an image document as the component primary image.

        Args:
            document_id: UUID of the document (must be doc_type image).
        """
        _require_write(self.request)

        document = Document.objects.select_related("component").get(id=document_id)
        _set_document_primary(document)
        document.refresh_from_db()
        return _serialize_mcp_document(document)

    def delete_component_document(
        self,
        document_id: str,
        purge_file: bool = False,
    ) -> dict:
        """Remove a document from a component.

        Args:
            document_id: UUID of the document.
            purge_file: If true, delete uploaded file from storage as well (URL-only docs unaffected).
        """
        _require_write(self.request)

        document = Document.objects.select_related("component").get(id=document_id)
        component_id = str(document.component_id)
        document_id_str = str(document.id)
        name = document.name

        if purge_file:
            document.delete()
        else:
            Document.objects.filter(pk=document.pk).delete()

        return {
            "deleted": True,
            "document_id": document_id_str,
            "component_id": component_id,
            "name": name,
        }

    def create_packet(
        self,
        component_id: str,
        location_id: str,
        description: str = "",
        is_trackable: bool = False,
        is_active: bool = True,
        initial_quantity: float = 0,
        unit_price: float = 0,
    ) -> dict:
        """Create a packet (stock batch) for a component at a warehouse location.

        Args:
            component_id: UUID of the component.
            location_id: UUID of a storage location (must have can_store_items=true).
            description: Optional packet description.
            is_trackable: Whether individual pieces are tracked.
            is_active: Whether the packet is active (default true).
            initial_quantity: Optional starting stock (creates an 'add' stock operation).
            unit_price: Unit price for the initial stock operation (default 0).
        """
        _require_write(self.request)

        component = Component.objects.get(id=component_id)
        location = _require_storage_location(location_id)

        packet = Packet.objects.create(
            component=component,
            location=location,
            description=description or None,
            is_trackable=is_trackable,
            is_active=is_active,
        )

        if initial_quantity:
            quantity = _normalize_stock_quantity("add", float(initial_quantity))
            StockOperation.objects.create(
                packet=packet,
                operation_type="add",
                quantity=quantity,
                relative_quantity=True,
                unit_price=unit_price or 0,
                description="MCP initial stock",
            )
            packet.refresh_from_db()

        return MCPPacketSerializer(packet).data

    def update_packet(
        self,
        packet_id: str,
        location_id: str = "",
        clear_location: bool = False,
        description: str = "",
        is_trackable: bool | None = None,
        state: str = "",
        is_active: bool | None = None,
    ) -> dict:
        """Update packet metadata (not stock quantity — use add_packet_stock_operation).

        Args:
            packet_id: UUID of the packet.
            location_id: New storage location UUID (leave empty to keep current).
            clear_location: Set true to remove the location.
            description: New description (leave empty to keep current).
            is_trackable: Set trackable flag (leave None to keep current).
            state: New lifecycle state — expected, stocked, in_transit or retired.
            is_active: Legacy flag mapped onto state; ignored when state is given.
        """
        _require_write(self.request)

        packet = Packet.objects.select_related("location").get(id=packet_id)
        update_fields = []

        if clear_location:
            packet.location = None
            update_fields.append("location")
        elif location_id:
            packet.location = _require_storage_location(location_id)
            update_fields.append("location")

        if description:
            packet.description = description
            update_fields.append("description")
        if is_trackable is not None:
            packet.is_trackable = is_trackable
            update_fields.append("is_trackable")
        if state:
            packet.state = _normalize_packet_state(state)
            update_fields.append("state")
        elif is_active is not None:
            # Legacy flag: mapped onto state, which is the source of truth.
            packet.apply_is_active(is_active)
            update_fields.append("state")

        if update_fields:
            packet.save(update_fields=update_fields)

        packet.refresh_from_db()
        return MCPPacketSerializer(packet).data

    def add_packet_stock_operation(
        self,
        packet_id: str,
        operation_type: str,
        quantity: float,
        relative_quantity: bool = True,
        unit_price: float | None = None,
        description: str = "",
    ) -> dict:
        """Add a stock operation to a packet (changes quantity via FIFO ledger).

        Args:
            packet_id: UUID of the packet.
            operation_type: One of add, remove, adjust, trans_in, trans_out, inventory, service, buy, sell.
            quantity: Quantity change (positive number; sign is normalized for in/out types).
            relative_quantity: If true, quantity is added to current stock (default). If false, sets absolute level.
            unit_price: Optional unit price for valued operations (buy/add).
            description: Optional note stored on the operation.
        """
        _require_write(self.request)

        operation_type = operation_type.strip().lower()
        if operation_type not in _STOCK_OPERATION_TYPES:
            raise ValueError(f"Invalid operation_type. Use one of: {', '.join(sorted(_STOCK_OPERATION_TYPES))}.")

        packet = Packet.objects.select_related("location").get(id=packet_id)
        normalized_quantity = _normalize_stock_quantity(operation_type, float(quantity))

        operation = StockOperation.objects.create(
            packet=packet,
            operation_type=operation_type,
            quantity=normalized_quantity,
            relative_quantity=relative_quantity,
            unit_price=unit_price,
            description=description or None,
        )
        packet.refresh_from_db()

        return {
            "operation": {
                "id": str(operation.id),
                "operation_type": operation.operation_type,
                "quantity": operation.quantity,
                "relative_quantity": operation.relative_quantity,
                "unit_price": operation.unit_price,
            },
            "packet": MCPPacketSerializer(packet).data,
        }

    def delete_parameter_type(self, parameter_type_id: str) -> dict:
        """Delete a parameter type. Removes related component parameters and category rules.

        Args:
            parameter_type_id: UUID of the parameter type to delete.
        """
        _require_write(self.request)

        pt = ParameterType.objects.get(id=parameter_type_id)
        payload = MCPParameterTypeSerializer(pt).data
        pt.delete()
        return {"deleted": True, "parameter_type": payload}

    def create_category(
        self,
        name: str,
        abbreviation: str,
        description: str = "",
        parent_id: str = "",
        color: str = "",
        icon: str = "",
    ) -> dict:
        """Create a component category.

        Args:
            name: Unique category name.
            abbreviation: Unique slug/abbreviation.
            description: Optional description.
            parent_id: Optional UUID of the parent category.
            color: Optional hex color (e.g. '#ff0000').
            icon: Optional icon identifier.
        """
        _require_write(self.request)

        category = Category.objects.create(
            name=name,
            abbreviation=abbreviation,
            description=description or None,
            parent=_get_parent(Category, parent_id),
            color=color or None,
            icon=icon or None,
        )
        return MCPCategorySerializer(category).data

    def update_category(
        self,
        category_id: str,
        name: str = "",
        abbreviation: str = "",
        description: str = "",
        parent_id: str | None = None,
        clear_parent: bool = False,
        color: str = "",
        icon: str = "",
    ) -> dict:
        """Update a component category.

        Args:
            category_id: UUID of the category to update.
            name: New name (leave empty to keep current).
            abbreviation: New abbreviation (leave empty to keep current).
            description: New description (leave empty to keep current).
            parent_id: New parent UUID (omit to keep current parent).
            clear_parent: Set true to move the category to the tree root.
            color: New color (leave empty to keep current).
            icon: New icon (leave empty to keep current).
        """
        _require_write(self.request)

        category = Category.objects.get(id=category_id)
        if name:
            category.name = name
        if abbreviation:
            category.abbreviation = abbreviation
        if description:
            category.description = description
        if clear_parent:
            category.parent = None
        elif parent_id:
            category.parent = _get_parent(Category, parent_id)
        if color:
            category.color = color
        if icon:
            category.icon = icon
        category.save()
        return MCPCategorySerializer(category).data

    def delete_category(self, category_id: str) -> dict:
        """Delete a category. Fails if the category has child categories or assigned components.

        Args:
            category_id: UUID of the category to delete.
        """
        _require_write(self.request)

        category = Category.objects.get(id=category_id)
        if Category.objects.filter(parent=category).exists():
            raise ValueError("Cannot delete category with child categories. Move or delete children first.")
        if Component.objects.filter(category=category).exists():
            raise ValueError("Cannot delete category with assigned components.")
        payload = MCPCategorySerializer(category).data
        category.delete()
        return {"deleted": True, "category": payload}

    def create_location(
        self,
        name: str,
        parent_id: str = "",
        location: str = "",
        description: str = "",
        can_store_items: bool = False,
    ) -> dict:
        """Create a warehouse location node.

        Args:
            name: Display name of the location.
            parent_id: Optional UUID of the parent location.
            location: Optional address or location label.
            description: Optional description.
            can_store_items: Whether components can be stored at this node.
        """
        _require_write(self.request)

        node = Warehouse.objects.create(
            name=name,
            parent=_get_parent(Warehouse, parent_id),
            location=location or None,
            description=description or None,
            can_store_items=can_store_items,
        )
        return MCPLocationSerializer(node).data

    def update_location(
        self,
        location_id: str,
        name: str = "",
        parent_id: str | None = None,
        clear_parent: bool = False,
        location: str = "",
        description: str = "",
        can_store_items: bool | None = None,
    ) -> dict:
        """Update a warehouse location.

        Args:
            location_id: UUID primary key or legacy location uuid field.
            name: New name (leave empty to keep current).
            parent_id: New parent UUID (omit to keep current parent).
            clear_parent: Set true to move the location to the tree root.
            location: New address/label (leave empty to keep current).
            description: New description (leave empty to keep current).
            can_store_items: Set storage flag (leave None to keep current).
        """
        _require_write(self.request)

        node = _resolve_location(location_id)
        if name:
            node.name = name
        if clear_parent:
            node.parent = None
        elif parent_id:
            node.parent = _get_parent(Warehouse, parent_id)
        if location:
            node.location = location
        if description:
            node.description = description
        if can_store_items is not None:
            node.can_store_items = can_store_items
        node.save()
        return MCPLocationSerializer(node).data

    def delete_location(self, location_id: str) -> dict:
        """Delete a warehouse location. Fails if it has child locations or active packets.

        Args:
            location_id: UUID primary key or legacy location uuid field.
        """
        _require_write(self.request)

        node = _resolve_location(location_id)
        if Warehouse.objects.filter(parent=node).exists():
            raise ValueError("Cannot delete location with child locations. Move or delete children first.")
        if Packet.objects.filter(location=node, is_active=True).exists():
            raise ValueError("Cannot delete location with active packets.")
        payload = MCPLocationSerializer(node).data
        node.delete()
        return {"deleted": True, "location": payload}

    def create_supplier(
        self,
        name: str,
        contact_info: str = "",
        website: str = "",
        link_template: str = "",
        min_order_quantity: int = 1,
    ) -> dict:
        """Create a supplier.

        Args:
            name: Supplier name.
            contact_info: Optional contact information.
            website: Optional website URL.
            link_template: Optional product link template with {symbol} placeholder.
            min_order_quantity: Minimum order quantity (default 1).
        """
        _require_write(self.request)

        supplier = Supplier.objects.create(
            name=name,
            contact_info=contact_info or None,
            website=website or None,
            link_template=link_template or None,
            min_order_quantity=min_order_quantity,
        )
        return MCPSupplierSerializer(supplier).data

    def update_supplier(
        self,
        supplier_id: str,
        name: str = "",
        contact_info: str = "",
        website: str = "",
        link_template: str = "",
        min_order_quantity: int | None = None,
    ) -> dict:
        """Update a supplier.

        Args:
            supplier_id: UUID of the supplier.
            name: New name (leave empty to keep current).
            contact_info: New contact info (leave empty to keep current).
            website: New website (leave empty to keep current).
            link_template: New link template (leave empty to keep current).
            min_order_quantity: New minimum order quantity (leave None to keep current).
        """
        _require_write(self.request)

        supplier = Supplier.objects.get(id=supplier_id)
        if name:
            supplier.name = name
        if contact_info:
            supplier.contact_info = contact_info
        if website:
            supplier.website = website
        if link_template:
            supplier.link_template = link_template
        if min_order_quantity is not None:
            supplier.min_order_quantity = min_order_quantity
        supplier.save()
        return MCPSupplierSerializer(supplier).data

    def delete_supplier(self, supplier_id: str) -> dict:
        """Delete a supplier and its component relations.

        Args:
            supplier_id: UUID of the supplier.
        """
        _require_write(self.request)

        supplier = Supplier.objects.get(id=supplier_id)
        payload = MCPSupplierSerializer(supplier).data
        supplier.delete()
        return {"deleted": True, "supplier": payload}

    def link_component_supplier(
        self,
        component_id: str,
        supplier_id: str,
        symbol: str = "",
        description: str = "",
        custom_url: str = "",
    ) -> dict:
        """Link a supplier to a component.

        Args:
            component_id: UUID of the component.
            supplier_id: UUID of the supplier.
            symbol: Optional supplier order code.
            description: Optional supplier-specific description.
            custom_url: Optional override URL for the product page.
        """
        _require_write(self.request)

        relation = SupplierRelation.objects.create(
            component=Component.objects.get(id=component_id),
            supplier=Supplier.objects.get(id=supplier_id),
            symbol=symbol or None,
            description=description or None,
            custom_url=custom_url or None,
        )
        return MCPSupplierRelationSerializer(relation).data

    def update_supplier_relation(
        self,
        relation_id: str,
        supplier_id: str = "",
        symbol: str = "",
        description: str = "",
        custom_url: str = "",
    ) -> dict:
        """Update a component–supplier relation.

        Args:
            relation_id: UUID of the supplier relation.
            supplier_id: New supplier UUID (leave empty to keep current).
            symbol: New symbol (leave empty to keep current).
            description: New description (leave empty to keep current).
            custom_url: New custom URL (leave empty to keep current).
        """
        _require_write(self.request)

        relation = SupplierRelation.objects.select_related("supplier", "component").get(id=relation_id)
        if supplier_id:
            relation.supplier = Supplier.objects.get(id=supplier_id)
        if symbol:
            relation.symbol = symbol
        if description:
            relation.description = description
        if custom_url:
            relation.custom_url = custom_url
        relation.save()
        return MCPSupplierRelationSerializer(relation).data

    def delete_supplier_relation(self, relation_id: str) -> dict:
        """Remove a component–supplier link.

        Args:
            relation_id: UUID of the supplier relation.
        """
        _require_write(self.request)

        relation = SupplierRelation.objects.select_related("supplier", "component").get(id=relation_id)
        payload = MCPSupplierRelationSerializer(relation).data
        relation.delete()
        return {"deleted": True, "relation": payload}

    def create_reservation(
        self,
        component_id: str,
        quantity: float,
        priority: int = 3,
        description: str = "",
        sources: list[dict] | None = None,
    ) -> dict:
        """Create a component reservation.

        Args:
            component_id: UUID of the component.
            quantity: Reserved quantity.
            priority: Priority from 1 (highest) to 5 (lowest). Default 3.
            description: Optional description.
            sources: Optional list of source objects, each with a 'type' key.
        """
        _require_write(self.request)

        if priority < 1 or priority > 5:
            raise ValueError("priority must be between 1 and 5.")

        reservation = Reservation.objects.create(
            component=Component.objects.get(id=component_id),
            quantity=quantity,
            priority=priority,
            description=description,
            sources=_validate_reservation_sources(sources or []),
            reserved_by=_mcp_actor_name(self.request),
        )
        return MCPReservationSerializer(reservation).data

    def update_reservation(
        self,
        reservation_id: str,
        quantity: float | None = None,
        priority: int | None = None,
        description: str = "",
        sources: list[dict] | None = None,
    ) -> dict:
        """Update a component reservation.

        Args:
            reservation_id: UUID of the reservation.
            quantity: New quantity (leave None to keep current).
            priority: New priority 1–5 (leave None to keep current).
            description: New description (leave empty to keep current).
            sources: New sources list (leave None to keep current).
        """
        _require_write(self.request)

        reservation = Reservation.objects.select_related("component").get(id=reservation_id)
        if quantity is not None:
            reservation.quantity = quantity
        if priority is not None:
            if priority < 1 or priority > 5:
                raise ValueError("priority must be between 1 and 5.")
            reservation.priority = priority
        if description:
            reservation.description = description
        if sources is not None:
            reservation.sources = _validate_reservation_sources(sources)
        reservation.save()
        return MCPReservationSerializer(reservation).data

    def delete_reservation(self, reservation_id: str) -> dict:
        """Delete a component reservation.

        Args:
            reservation_id: UUID of the reservation.
        """
        _require_write(self.request)

        reservation = Reservation.objects.select_related("component").get(id=reservation_id)
        payload = MCPReservationSerializer(reservation).data
        reservation.delete()
        return {"deleted": True, "reservation": payload}

    def add_to_print_queue(
        self,
        target_type: str,
        target_id: str,
        print_list_id: str = "",
        kind: str = "label",
    ) -> dict:
        """Add a warehouse location, packet, or component label to a print queue.

        Args:
            target_type: One of component, packet, or location.
            target_id: UUID of the target (for location, id or legacy uuid field).
            print_list_id: Optional queue UUID. Uses the default queue when omitted.
            kind: Print item kind — label (default) or document.
        """
        _require_write(self.request)

        if not _mcp_print_queue_user(self.request) and not (
            _mcp_service_token(self.request)
            and _mcp_service_token(self.request).allowed_print_lists.exists()
        ):
            raise ValueError(
                "Print queue access requires a service token linked to a user "
                "or with allowed print queues configured."
            )

        queue = _resolve_mcp_print_queue(self.request, print_list_id)
        if not queue:
            raise ValueError("Print queue not found.")

        target = _resolve_print_target(target_type.strip().lower(), target_id)
        item = _create_print_queue_item(queue, target, kind=kind.strip().lower() or "label")
        return MCPPrintQueueItemSerializer(item).data

    def add_targets_to_print_queue(
        self,
        targets: list[dict],
        print_list_id: str = "",
        kind: str = "label",
    ) -> list[dict]:
        """Add multiple labels to a print queue in one call.

        Args:
            targets: List of objects with target_type and target_id keys.
            print_list_id: Optional queue UUID. Uses the default queue when omitted.
            kind: Print item kind — label (default) or document.
        """
        _require_write(self.request)

        if not isinstance(targets, list) or not targets:
            raise ValueError("targets must be a non-empty list.")

        if not _mcp_print_queue_user(self.request) and not (
            _mcp_service_token(self.request)
            and _mcp_service_token(self.request).allowed_print_lists.exists()
        ):
            raise ValueError(
                "Print queue access requires a service token linked to a user "
                "or with allowed print queues configured."
            )

        queue = _resolve_mcp_print_queue(self.request, print_list_id)
        if not queue:
            raise ValueError("Print queue not found.")

        normalized_kind = kind.strip().lower() or "label"
        results = []
        for index, entry in enumerate(targets):
            if not isinstance(entry, dict):
                raise ValueError(f"targets[{index}] must be an object.")
            target_type = (entry.get("target_type") or "").strip().lower()
            target_id = (entry.get("target_id") or "").strip()
            if not target_type or not target_id:
                raise ValueError(f"targets[{index}] must include target_type and target_id.")
            target = _resolve_print_target(target_type, target_id)
            item = _create_print_queue_item(queue, target, kind=normalized_kind)
            results.append(MCPPrintQueueItemSerializer(item).data)
        return results

    def remove_print_queue_item(self, item_id: str) -> dict:
        """Remove an item from a print queue.

        Args:
            item_id: UUID of the print queue item.
        """
        _require_write(self.request)

        queues = _mcp_print_queues_queryset(self.request)
        item = (
            PrintItem.objects.filter(id=item_id, print_list__in=queues)
            .select_related("content_type", "print_list")
            .first()
        )
        if not item:
            raise ValueError("Print queue item not found.")

        payload = MCPPrintQueueItemSerializer(item).data
        item.delete()
        return {"deleted": True, "item": payload}

    def create_print_queue(
        self,
        name: str = "",
        is_public: bool = True,
        is_default: bool = False,
    ) -> dict:
        """Create a print queue owned by the user behind the service token.

        Args:
            name: Queue name. Auto-generated when empty.
            is_public: Whether other users can see and print from the queue (default true).
            is_default: Make this the owner's default queue (demotes the previous default).
        """
        _require_write(self.request)

        owner = _mcp_print_queue_user(self.request)
        if not owner:
            raise ValueError(
                "Creating a print queue requires a service token linked to a user."
            )

        queue = create_print_list(
            owner,
            name=name.strip(),
            is_public=is_public,
            is_default=True if is_default else None,
        )

        # Keep a queue-restricted token able to use what it just created.
        token = _mcp_service_token(self.request)
        if token and token.allowed_print_lists.exists():
            token.allowed_print_lists.add(queue)

        return MCPPrintQueueSerializer(queue).data

    # --- Purchase requests -------------------------------------------------- #

    def create_purchase_request(
        self,
        quantity: int = 1,
        component_id: str = "",
        item_name: str = "",
        description: str = "",
    ) -> dict:
        """File a purchase request (a wish to buy something), optionally for a known component.

        Args:
            quantity: Requested quantity (default 1).
            component_id: UUID of a warehouse component, when the wish is for a stocked item.
            item_name: Free-text item name, required when no component is given.
            description: Optional note.
        """
        _require_write(self.request)

        if quantity <= 0:
            raise ValueError("quantity must be greater than zero.")

        component = Component.objects.get(id=component_id) if component_id else None
        name = item_name.strip()
        if not component and not name:
            raise ValueError("Provide component_id or item_name.")

        obj = PurchaseRequest.objects.create(
            quantity=quantity,
            component=component,
            item_name=name or None,
            description=description,
            requested_by=_mcp_actor_user(self.request),
        )
        return MCPPurchaseRequestSerializer(obj).data

    def update_purchase_request(
        self,
        request_id: str,
        quantity: int = 0,
        item_name: str = "",
        description: str = "",
        component_id: str = "",
    ) -> dict:
        """Update a purchase request. Empty/zero arguments keep the current value.

        Args:
            request_id: UUID of the purchase request.
            quantity: New quantity (leave 0 to keep current).
            item_name: New item name (leave empty to keep current).
            description: New description (leave empty to keep current).
            component_id: New component UUID (leave empty to keep current).
        """
        _require_write(self.request)

        obj = PurchaseRequest.objects.get(id=request_id)
        update_fields = []

        if quantity:
            if quantity <= 0:
                raise ValueError("quantity must be greater than zero.")
            obj.quantity = quantity
            update_fields.append("quantity")
        if item_name:
            obj.item_name = item_name.strip()
            update_fields.append("item_name")
        if description:
            obj.description = description
            update_fields.append("description")
        if component_id:
            obj.component = Component.objects.get(id=component_id)
            update_fields.append("component")

        if update_fields:
            obj.save(update_fields=update_fields)

        return MCPPurchaseRequestSerializer(obj).data

    def delete_purchase_request(self, request_id: str) -> dict:
        """Delete a purchase request.

        Args:
            request_id: UUID of the purchase request.
        """
        _require_write(self.request)

        obj = PurchaseRequest.objects.get(id=request_id)
        payload = MCPPurchaseRequestSerializer(obj).data
        obj.delete()
        return {"deleted": True, "purchase_request": payload}

    def assign_purchase_requests(self, purchase_id: str, request_ids: list[str]) -> dict:
        """Attach purchase requests to a purchase so they are covered by that order.

        Args:
            purchase_id: UUID of the purchase.
            request_ids: UUIDs of the purchase requests to attach.
        """
        _require_write(self.request)

        purchase = _resolve_purchase(purchase_id)
        assigned = purchase_service.assign_requests_to_purchase(purchase, request_ids)
        return {"success": True, "purchase_id": str(purchase.id), "assigned": assigned}

    # --- Purchases ---------------------------------------------------------- #

    def create_purchase(
        self,
        supplier_id: str,
        currency: str = "",
        note: str = "",
        delivery_date: str = "",
    ) -> dict:
        """Create an empty purchase (draft order) for a supplier. Add lines with set_purchase_items.

        Args:
            supplier_id: UUID of the supplier.
            currency: Optional currency code, e.g. CZK or EUR.
            note: Optional note.
            delivery_date: Optional expected delivery date, ISO format YYYY-MM-DD.
        """
        _require_write(self.request)

        supplier = Supplier.objects.get(id=supplier_id)
        purchase = Purchase.objects.create(
            supplier=supplier,
            currency=currency.strip() or None,
            note=note,
            delivery_date=_parse_date(delivery_date, "delivery_date"),
            created_by=_mcp_actor_user(self.request),
        )
        return MCPPurchaseDetailSerializer(purchase).data

    def set_purchase_items(
        self,
        purchase_id: str,
        items: list[dict],
        remove_item_ids: list[int] | None = None,
    ) -> dict:
        """Add or update purchase lines, and optionally remove lines.

        Each entry in items is a dict with:
          item_id (int, omit to create), item_type (component or non_stock),
          component_id, supplier_relation_id, name (non-stock only), symbol,
          description, quantity, package_size, unit_price_original,
          stock_location_id (target warehouse location, assignable already while ordering).

        Args:
            purchase_id: UUID of the purchase.
            items: List of line definitions (see above).
            remove_item_ids: Integer ids of lines to delete.
        """
        _require_write(self.request)

        purchase = _resolve_purchase(purchase_id)
        errors: list[str] = []
        touched: list[PurchaseItem] = []

        with transaction.atomic():
            for index, raw in enumerate(items or []):
                if not isinstance(raw, dict):
                    errors.append(f"items[{index}] must be an object.")
                    continue
                try:
                    touched.append(_apply_purchase_item(purchase, raw))
                except (ValueError, Component.DoesNotExist, SupplierRelation.DoesNotExist) as exc:
                    errors.append(f"items[{index}]: {exc}")
                except DjangoValidationError as exc:
                    errors.append(f"items[{index}]: {'; '.join(exc.messages)}")

            if errors:
                raise ValueError("Purchase items update failed: " + "; ".join(errors))

            if remove_item_ids:
                PurchaseItem.objects.filter(purchase=purchase, id__in=remove_item_ids).delete()

        return {
            "success": True,
            "purchase_id": str(purchase.id),
            "items": MCPPurchaseItemSerializer(touched, many=True).data,
            "removed": len(remove_item_ids or []),
        }

    def set_purchase_item_location(self, purchase_id: str, item_id: int, location_id: str) -> dict:
        """Set the target stock location of one purchase line while the order is being built.

        Args:
            purchase_id: UUID of the purchase.
            item_id: Integer id of the purchase line.
            location_id: UUID of a storage location (must have can_store_items=true).
        """
        _require_write(self.request)

        item = PurchaseItem.objects.select_related("purchase", "draft_packet").get(
            id=item_id, purchase_id=purchase_id
        )
        if item.item_type != PurchaseItemType.COMPONENT:
            raise ValueError("Non-stock item cannot have a stock location.")

        location = _require_storage_location(location_id)
        item.stock_location = location
        item.save(update_fields=["stock_location"])

        # A draft packet created earlier follows the item to its new location.
        packet = item.draft_packet
        if packet and packet.state == PacketState.EXPECTED:
            packet.location = location
            packet.save(update_fields=["location"])

        return MCPPurchaseItemSerializer(item).data

    def transition_purchase(self, purchase_id: str, target_status: str) -> dict:
        """Move a purchase to the next lifecycle status.

        Order: draft -> items_defined -> priced -> closed -> exported -> receiving
        -> stocking -> completed. Exporting creates the draft (expected) packets for
        every component line, so each line needs a stock location by then.

        Args:
            purchase_id: UUID of the purchase.
            target_status: Status to move to.
        """
        _require_write(self.request)

        target = (target_status or "").strip().lower()
        if target not in PurchaseStatus.values:
            allowed = ", ".join(PurchaseStatus.values)
            raise ValueError(f"Invalid target_status '{target_status}'. Use one of: {allowed}.")

        purchase = _resolve_purchase(purchase_id)
        try:
            purchase_service.transition_purchase(purchase, target)
        except DjangoValidationError as exc:
            raise _domain_error(exc)

        purchase.refresh_from_db()
        return MCPPurchaseDetailSerializer(purchase).data

    def receive_purchase_items(
        self,
        purchase_id: str,
        lines: list[dict],
        queue_labels: bool = False,
        print_list_id: str = "",
    ) -> dict:
        """Record goods arriving for a purchase. Partial deliveries are supported.

        Each entry in lines is a dict with: item_id (int, required), quantity (int, required),
        stock_location_id (optional, defaults to the line's location), delivery_date
        (optional ISO date) and note (optional).

        Args:
            purchase_id: UUID of the purchase.
            lines: List of received lines (see above).
            queue_labels: Queue a packet label for every received component line.
            print_list_id: Print queue UUID for the labels. Uses the default queue when omitted.
        """
        _require_write(self.request)

        purchase = _resolve_purchase(purchase_id)
        actor = _mcp_actor_user(self.request)

        print_queue = None
        if queue_labels:
            print_queue = _resolve_mcp_print_queue(self.request, print_list_id)
            if not print_queue:
                raise ValueError(
                    "No print queue available. Pass print_list_id or create one with create_print_queue."
                )

        receive_lines = []
        for index, raw in enumerate(lines or []):
            if not isinstance(raw, dict):
                raise ValueError(f"lines[{index}] must be an object.")
            item_id = raw.get("item_id")
            if item_id is None:
                raise ValueError(f"lines[{index}]: item_id is required.")
            try:
                item = PurchaseItem.objects.select_related(
                    "component", "stock_location", "draft_packet", "purchase"
                ).get(id=item_id, purchase_id=purchase.id)
            except PurchaseItem.DoesNotExist:
                raise ValueError(f"lines[{index}]: purchase item {item_id} not found in this purchase.")

            location_id = raw.get("stock_location_id") or ""
            receive_lines.append(
                purchase_service.ReceiveLine(
                    item=item,
                    quantity=int(raw.get("quantity") or 0),
                    stock_location=_require_storage_location(location_id) if location_id else None,
                    delivery_date=_parse_date(raw.get("delivery_date") or "", "delivery_date"),
                    note=raw.get("note") or "",
                )
            )

        try:
            result = purchase_service.receive_purchase(
                purchase, receive_lines, actor=actor, print_queue=print_queue
            )
        except DjangoValidationError as exc:
            raise _domain_error(exc)

        purchase.refresh_from_db()
        return {
            "success": True,
            "purchase": MCPPurchaseDetailSerializer(purchase).data,
            "deliveries": MCPPurchaseDeliverySerializer(result.deliveries, many=True).data,
            "queued_labels": result.queued_labels,
            "print_list_id": str(print_queue.id) if print_queue else None,
        }

    def stock_purchase_deliveries(
        self,
        purchase_id: str,
        delivery_ids: list[int] | None = None,
    ) -> dict:
        """Book received deliveries into stock, flipping their expected packets to stocked.

        Completes the purchase automatically once everything is delivered and stocked.

        Args:
            purchase_id: UUID of the purchase.
            delivery_ids: Ids of the deliveries to stock. All unstocked ones when omitted.
        """
        _require_write(self.request)

        purchase = _resolve_purchase(purchase_id)
        qs = purchase_service.unstocked_deliveries(purchase)
        if delivery_ids:
            qs = qs.filter(id__in=delivery_ids)
            found = {d.id for d in qs}
            missing = [d for d in delivery_ids if d not in found]
            if missing:
                raise ValueError(
                    f"Deliveries not found or already stocked: {', '.join(str(m) for m in missing)}."
                )

        deliveries = list(qs)
        if not deliveries:
            raise ValueError("No unstocked deliveries to stock for this purchase.")

        try:
            result = purchase_service.stock_purchase(
                purchase, deliveries, actor=_mcp_actor_user(self.request)
            )
        except DjangoValidationError as exc:
            raise _domain_error(exc)

        purchase.refresh_from_db()
        return {
            "success": True,
            "stocked_deliveries": result.stocked_deliveries,
            "completed": result.completed,
            "purchase": MCPPurchaseDetailSerializer(purchase).data,
        }

    def complete_purchase(self, purchase_id: str) -> dict:
        """Complete a purchase directly from receiving (used when nothing needs stocking).

        Args:
            purchase_id: UUID of the purchase.
        """
        _require_write(self.request)

        purchase = _resolve_purchase(purchase_id)
        try:
            purchase_service.transition_purchase(purchase, PurchaseStatus.COMPLETED)
        except DjangoValidationError as exc:
            raise _domain_error(exc)

        purchase.refresh_from_db()
        return MCPPurchaseDetailSerializer(purchase).data
