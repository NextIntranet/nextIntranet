from django.db.models import Q
from rest_framework import generics, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from nextintranet_backend.permissions import AreaAccessPermission
from nextintranet_warehouse.models.component import Component, Reservation


class ReservationSerializer(serializers.ModelSerializer):
    component_id = serializers.PrimaryKeyRelatedField(
        source='component',
        queryset=Component.objects.all()
    )
    component_name = serializers.CharField(source='component.name', read_only=True)
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
            'priority',
            'description',
            'sources',
            'reserved_by',
            'reservation_date',
            'created_at',
        ]
        read_only_fields = ['id', 'component_name', 'reserved_by', 'reservation_date', 'created_at']

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
        queryset = Reservation.objects.select_related('component')
        search = self.request.query_params.get('search')
        priority = self.request.query_params.get('priority')
        component = self.request.query_params.get('component')
        source_type = self.request.query_params.get('source_type')
        bom_id = self.request.query_params.get('bom_id')

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

        if source_type == 'production' and bom_id:
            queryset = queryset.filter(
                sources__contains=[{'type': 'production', 'bom_id': str(bom_id)}]
            )

        return queryset.order_by('-reservation_date')


class ReservationDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ReservationSerializer
    queryset = Reservation.objects.select_related('component')
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'
