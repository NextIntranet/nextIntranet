from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from nextintranet_backend.permissions import AreaAccessPermission
from nextintranet_warehouse.models.component import Component, Reservation
from nextintranet_warehouse.models.warehouse import Warehouse
from nextintranet_warehouse.services.availability import default_warehouse_for_user


class ReservationSerializer(serializers.ModelSerializer):
    component_id = serializers.PrimaryKeyRelatedField(
        source='component',
        queryset=Component.objects.all()
    )
    component_name = serializers.CharField(source='component.name', read_only=True)
    warehouse = serializers.PrimaryKeyRelatedField(
        queryset=Warehouse.objects.all(),
        required=False,
        allow_null=True,
    )
    warehouse_name = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    reserved_by = serializers.CharField(read_only=True)
    sources = serializers.ListField(
        child=serializers.DictField(allow_empty=True),
        required=False,
        default=list,
        allow_empty=True,
    )

    class Meta:
        model = Reservation
        fields = [
            'id',
            'component_id',
            'component_name',
            'quantity',
            'warehouse',
            'warehouse_name',
            'priority',
            'description',
            'sources',
            'reserved_by',
            'reservation_date',
            'expiration_date',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['id', 'component_name', 'reserved_by', 'reservation_date', 'created_at']

    def get_warehouse_name(self, obj):
        return obj.warehouse.full_path if obj.warehouse_id else None

    def get_is_active(self, obj):
        return obj.expiration_date is None or obj.expiration_date >= timezone.now()

    def validate_warehouse(self, value):
        if value is not None and not value.is_warehouse:
            raise serializers.ValidationError(f"Location '{value.full_path}' is not a warehouse.")
        return value

    def validate_sources(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("sources must be a list.")
        for i, item in enumerate(value):
            if not isinstance(item, dict):
                raise serializers.ValidationError(f"sources[{i}] must be an object.")
            if 'type' not in item:
                raise serializers.ValidationError(f"sources[{i}] must have a 'type' key.")
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        if validated_data.get('warehouse') is None:
            warehouse_id = default_warehouse_for_user(getattr(request, 'user', None))
            if warehouse_id is None:
                raise serializers.ValidationError({'warehouse': 'Choose the warehouse the stock is held in.'})
            validated_data['warehouse'] = Warehouse.objects.get(id=warehouse_id)
        if request and request.user and request.user.is_authenticated:
            validated_data['reserved_by'] = request.user.get_full_name() or request.user.username
        else:
            validated_data['reserved_by'] = 'Unknown'
        return super().create(validated_data)


class ReservationPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class ReservationListAPIView(generics.ListCreateAPIView):
    serializer_class = ReservationSerializer
    pagination_class = ReservationPagination
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'

    def get_queryset(self):
        queryset = Reservation.objects.select_related('component', 'warehouse')
        search = self.request.query_params.get('search')
        priority = self.request.query_params.get('priority')
        component = self.request.query_params.get('component')
        source_type = self.request.query_params.get('source_type')
        bom_id = self.request.query_params.get('bom_id')
        warehouse = self.request.query_params.get('warehouse')
        active = self.request.query_params.get('active')

        if search:
            queryset = queryset.filter(
                Q(component__name__icontains=search) |
                Q(component__id__icontains=search) |
                Q(reserved_by__icontains=search) |
                Q(description__icontains=search)
            )

        if priority:
            queryset = queryset.filter(priority=priority)

        if component:
            queryset = queryset.filter(component_id=component)

        if warehouse:
            queryset = queryset.filter(warehouse_id=warehouse)

        if active in ('1', 'true', 'yes'):
            queryset = queryset.active()

        if source_type == 'production' and bom_id:
            queryset = queryset.filter(
                sources__contains=[{'type': 'production', 'bom_id': str(bom_id)}]
            )

        return queryset.order_by('-reservation_date')


class ReservationDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ReservationSerializer
    queryset = Reservation.objects.select_related('component', 'warehouse')
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'
