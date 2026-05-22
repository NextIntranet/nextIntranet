from rest_framework import serializers
from nextintranet_warehouse.models.component import (
    Component, ComponentParameter, ParameterType, Tag, Document,
    Packet, Supplier, SupplierRelation, Reservation,
)
from nextintranet_warehouse.models.warehouse import Warehouse
from nextintranet_warehouse.models.category import Category
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
        return labels.get(obj.doc_type, obj.doc_type)


class MCPSupplierRelationSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = SupplierRelation
        fields = ["id", "supplier_name", "symbol", "custom_url"]


class MCPPacketSerializer(serializers.ModelSerializer):
    component_id = serializers.UUIDField(source="component_id", read_only=True)
    location_id = serializers.UUIDField(source="location_id", read_only=True, allow_null=True)
    location_name = serializers.CharField(source="location.full_path", read_only=True, default=None)

    class Meta:
        model = Packet
        fields = [
            "id", "component_id", "location_id", "location_name",
            "count", "description", "is_trackable", "is_active",
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
        fields = ["id", "name", "category_name", "quantity", "reserved", "locations"]

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
