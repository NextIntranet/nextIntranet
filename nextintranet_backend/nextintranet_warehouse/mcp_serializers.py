from rest_framework import serializers
from nextintranet_backend.models.printList import PrintList, PrintItem
from nextintranet_warehouse.models.component import (
    Component, ComponentParameter, ParameterType, Tag, Document,
    Packet, Supplier, SupplierRelation, Reservation,
)
from nextintranet_warehouse.models.warehouse import Warehouse
from nextintranet_warehouse.models.category import Category
from nextintranet_warehouse.models.purchase import (
    Purchase, PurchaseDelivery, PurchaseItem, PurchaseRequest,
)
from nextintranet_warehouse.services.parameter_values import format_parameter_display_value


class MCPParameterTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParameterType
        fields = ["id", "name", "unit", "value_type", "format_with_si_prefix"]


class MCPComponentParameterSerializer(serializers.ModelSerializer):
    parameter_name = serializers.CharField(source="parameter_type.name", read_only=True)
    parameter_unit = serializers.CharField(source="parameter_type.unit", read_only=True)
    display_value = serializers.SerializerMethodField()

    class Meta:
        model = ComponentParameter
        fields = ["id", "parameter_name", "parameter_unit", "value", "value_number", "display_value"]

    def get_display_value(self, obj):
        return format_parameter_display_value(obj.value, obj.value_number, obj.parameter_type)


class MCPDocumentSerializer(serializers.ModelSerializer):
    doc_type_label = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = ["id", "name", "doc_type", "doc_type_label", "url", "is_primary", "access_level"]

    def get_doc_type_label(self, obj):
        labels = dict(Document.DOCUMENT_TYPE_CHOICES)
        label = labels.get(obj.doc_type, obj.doc_type)
        return str(label)


class MCPSupplierRelationSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = SupplierRelation
        fields = ["id", "supplier_name", "symbol", "custom_url"]


class MCPPacketSerializer(serializers.ModelSerializer):
    component_id = serializers.UUIDField(read_only=True)
    location_id = serializers.UUIDField(read_only=True, allow_null=True)
    location_name = serializers.SerializerMethodField()
    # TODO: itemValue/totalValue/price_source are pricing data and should only be
    # visible to warehouse staff ("skladníci"), but MCP service tokens are generic
    # scope-based tokens (mcp:read/mcp:write) with no live per-request user
    # permission check, so this isn't gated yet. See follow-up issue for the two
    # candidate approaches (new scope checked at token issuance vs. live lookup
    # against ServiceToken.created_by.access_permissions).
    price_source = serializers.ReadOnlyField()

    def get_location_name(self, obj):
        if not obj.location_id:
            return None
        return str(obj.location.full_path)

    class Meta:
        model = Packet
        fields = [
            "id", "component_id", "location_id", "location_name",
            "count", "description", "is_trackable", "state", "is_active",
            "itemValue", "totalValue", "price_source",
        ]


class MCPComponentListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    category_slug = serializers.CharField(source="category.abbreviation", read_only=True, default=None)
    quantity = serializers.FloatField(source="count", read_only=True)
    tags = serializers.SlugRelatedField(slug_field="name", many=True, read_only=True)

    class Meta:
        model = Component
        fields = [
            "id", "name", "description", "category_name", "category_slug",
            "quantity", "unit_type", "tags",
        ]


class MCPComponentDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    category_slug = serializers.CharField(source="category.abbreviation", read_only=True, default=None)
    quantity = serializers.FloatField(source="count", read_only=True)
    tags = serializers.SlugRelatedField(slug_field="name", many=True, read_only=True)
    parameters = MCPComponentParameterSerializer(many=True, read_only=True)
    documents = MCPDocumentSerializer(many=True, read_only=True)
    packets = MCPPacketSerializer(many=True, read_only=True)
    suppliers = MCPSupplierRelationSerializer(many=True, read_only=True)

    class Meta:
        model = Component
        fields = [
            "id", "name", "description", "category_name", "category_slug",
            "quantity", "unit_type", "tags", "selling_price", "internal_price",
            "parameters", "documents", "packets", "suppliers",
            "created_at",
        ]


class MCPInventoryItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    quantity = serializers.FloatField(source="count", read_only=True)
    reserved = serializers.SerializerMethodField()
    locations = serializers.SerializerMethodField()

    class Meta:
        model = Component
        fields = ["id", "name", "category_name", "quantity", "reserved", "locations", "internal_price"]

    def get_reserved(self, obj):
        return sum(r.quantity for r in obj.reservations.all())

    def get_locations(self, obj):
        return [
            {"name": p.location.full_path if p.location else None, "count": float(p.count)}
            for p in obj.packets.filter(is_active=True)
        ]


class MCPSupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id", "name", "contact_info", "website", "link_template", "min_order_quantity",
        ]


class MCPSupplierRelationSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)
    component_name = serializers.CharField(source="component.name", read_only=True)
    component_id = serializers.UUIDField(source="component.id", read_only=True)
    supplier_id = serializers.UUIDField(source="supplier.id", read_only=True, allow_null=True)

    class Meta:
        model = SupplierRelation
        fields = [
            "id", "component_id", "component_name", "supplier_id", "supplier_name",
            "symbol", "description", "custom_url",
        ]


class MCPReservationSerializer(serializers.ModelSerializer):
    component_id = serializers.UUIDField(source="component.id", read_only=True)
    component_name = serializers.CharField(source="component.name", read_only=True)

    class Meta:
        model = Reservation
        fields = [
            "id", "component_id", "component_name", "quantity", "priority",
            "description", "sources", "reserved_by", "reservation_date", "expiration_date",
        ]


class MCPCategoryFlatSerializer(serializers.ModelSerializer):
    full_path = serializers.CharField(read_only=True)
    parent_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = Category
        fields = [
            "id", "name", "abbreviation", "description", "parent_id", "full_path",
        ]


class MCPCategorySerializer(MCPCategoryFlatSerializer):
    children = serializers.SerializerMethodField()

    class Meta(MCPCategoryFlatSerializer.Meta):
        fields = MCPCategoryFlatSerializer.Meta.fields + ["children"]

    def get_children(self, obj):
        children = obj.get_children()
        return MCPCategorySerializer(children, many=True).data


class MCPLocationFlatSerializer(serializers.ModelSerializer):
    full_path = serializers.CharField(read_only=True)
    parent_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = Warehouse
        fields = [
            "id", "uuid", "name", "location", "description", "parent_id",
            "full_path", "can_store_items",
        ]


class MCPLocationSerializer(MCPLocationFlatSerializer):
    children = serializers.SerializerMethodField()

    class Meta(MCPLocationFlatSerializer.Meta):
        fields = MCPLocationFlatSerializer.Meta.fields + ["children"]

    def get_children(self, obj):
        children = obj.get_children()
        return MCPLocationSerializer(children, many=True).data


_PRINT_TARGET_TYPE_BY_MODEL = {
    "component": "component",
    "packet": "packet",
    "warehouse": "location",
}


class MCPPrintQueueSerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = PrintList
        fields = [
            "id",
            "name",
            "is_default",
            "is_public",
            "items_count",
            "created_at",
        ]

    def get_items_count(self, obj):
        return obj.items.count()


class MCPPrintQueueItemSerializer(serializers.ModelSerializer):
    target_type = serializers.SerializerMethodField()
    target_label = serializers.SerializerMethodField()

    class Meta:
        model = PrintItem
        fields = [
            "id",
            "print_list",
            "kind",
            "status",
            "target_type",
            "target_label",
            "object_id",
            "payload",
            "created_at",
        ]

    def get_target_type(self, obj):
        if not obj.content_type:
            return None
        return _PRINT_TARGET_TYPE_BY_MODEL.get(obj.content_type.model)

    def get_target_label(self, obj):
        content = obj.content_object
        if not content:
            return None
        if hasattr(content, "name") and content.name:
            return content.name
        return str(getattr(content, "id", content))


class MCPPurchaseRequestSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source="component.name", read_only=True, default=None)
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseRequest
        fields = [
            "id", "created_at", "quantity", "item_name", "description",
            "component", "component_name", "purchase", "requested_by_name",
        ]

    def get_requested_by_name(self, obj):
        if not obj.requested_by:
            return None
        return obj.requested_by.get_full_name() or obj.requested_by.username


class MCPPurchaseDeliverySerializer(serializers.ModelSerializer):
    stock_location_id = serializers.UUIDField(source="stock_location.id", read_only=True, allow_null=True)
    stock_location_name = serializers.CharField(source="stock_location.full_path", read_only=True, default=None)
    packet_id = serializers.UUIDField(source="packet.id", read_only=True, allow_null=True)

    class Meta:
        model = PurchaseDelivery
        fields = [
            "id", "purchase_item", "delivery_date", "delivered_quantity", "note",
            "stock_location_id", "stock_location_name", "packet_id",
            "is_stocked", "stocked_at",
        ]


class MCPPurchaseItemSerializer(serializers.ModelSerializer):
    component_id = serializers.UUIDField(source="component.id", read_only=True, allow_null=True)
    component_name = serializers.CharField(source="component.name", read_only=True, default=None)
    supplier_relation_id = serializers.UUIDField(source="supplier_relation.id", read_only=True, allow_null=True)
    stock_location_id = serializers.UUIDField(source="stock_location.id", read_only=True, allow_null=True)
    stock_location_name = serializers.CharField(source="stock_location.full_path", read_only=True, default=None)
    draft_packet_id = serializers.UUIDField(source="draft_packet.id", read_only=True, allow_null=True)
    draft_packet_state = serializers.CharField(source="draft_packet.state", read_only=True, default=None)
    deliveries = MCPPurchaseDeliverySerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseItem
        fields = [
            "id", "item_type", "component_id", "component_name", "supplier_relation_id",
            "symbol", "name", "description", "requested_quantity", "quantity", "package_size",
            "unit_price_original", "unit_price_converted",
            "delivered_quantity", "stocked_quantity", "is_fully_delivered",
            "stock_location_id", "stock_location_name",
            "draft_packet_id", "draft_packet_state", "deliveries",
        ]


class MCPPurchaseListSerializer(serializers.ModelSerializer):
    supplier_id = serializers.UUIDField(source="supplier.id", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Purchase
        fields = [
            "id", "status", "supplier_id", "supplier_name", "currency",
            "total_price_original", "total_price_converted", "note",
            "delivery_date", "created_at", "exported_at", "completed_at", "items_count",
        ]

    def get_items_count(self, obj):
        return obj.items.count()


class MCPPurchaseDetailSerializer(MCPPurchaseListSerializer):
    items = MCPPurchaseItemSerializer(many=True, read_only=True)
    requests = MCPPurchaseRequestSerializer(many=True, read_only=True)

    class Meta(MCPPurchaseListSerializer.Meta):
        fields = MCPPurchaseListSerializer.Meta.fields + [
            "export_mode", "closed_at", "receiving_started_at", "stocking_started_at",
            "stocked_date", "items", "requests",
        ]
