from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from nextintranet_warehouse.models.component import WarehouseActivity


class WarehouseActivitySerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    packet_id = serializers.UUIDField(source="packet.id", read_only=True)
    component_id = serializers.UUIDField(source="component.id", read_only=True)
    packet_label = serializers.SerializerMethodField()
    packet_serial_code = serializers.SerializerMethodField()
    packet_location_leaf = serializers.SerializerMethodField()
    stock_operation_id = serializers.UUIDField(source="stock_operation.id", read_only=True)
    stock_operation_type = serializers.CharField(source="stock_operation.operation_type", read_only=True)
    quantity = serializers.FloatField(source="stock_operation.quantity", read_only=True)
    relative_quantity = serializers.BooleanField(source="stock_operation.relative_quantity", read_only=True)
    unit_price = serializers.FloatField(source="stock_operation.unit_price", read_only=True)

    class Meta:
        model = WarehouseActivity
        fields = [
            "id",
            "packet_id",
            "packet_label",
            "packet_serial_code",
            "packet_location_leaf",
            "component_id",
            "user",
            "user_name",
            "occurred_at",
            "activity_type",
            "source",
            "stock_operation_id",
            "stock_operation_type",
            "quantity",
            "relative_quantity",
            "unit_price",
            "description",
            "metadata",
            "before",
            "after",
        ]

    def get_user_name(self, instance):
        user = instance.user
        if not user:
            return None
        full_name = user.get_full_name().strip()
        return full_name or user.username

    def get_packet_label(self, instance):
        packet = instance.packet
        if not packet:
            return None
        if packet.location:
            return packet.location.full_path
        return str(packet.id)

    def get_packet_serial_code(self, instance):
        packet = instance.packet
        if not packet:
            return None
        return packet.serial_code or None

    def get_packet_location_leaf(self, instance):
        packet = instance.packet
        if not packet or not packet.location:
            return None
        full_path = packet.location.full_path
        return full_path.rsplit("/", 1)[-1] if "/" in full_path else full_path


class ActivityPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            "count": self.page.paginator.count,
            "total_pages": self.page.paginator.num_pages,
            "current_page": self.page.number,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "results": data,
        })
