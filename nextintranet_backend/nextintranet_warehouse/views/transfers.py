from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from nextintranet_backend.permissions import AreaAccessPermission
from nextintranet_warehouse.models.component import Component
from nextintranet_warehouse.models.transfer import TransferRequest, TransferStatus
from nextintranet_warehouse.models.warehouse import Warehouse


class TransferRequestSerializer(serializers.ModelSerializer):
    component_id = serializers.PrimaryKeyRelatedField(source='component', queryset=Component.objects.all())
    component_name = serializers.CharField(source='component.name', read_only=True)
    source_warehouse_name = serializers.CharField(source='source_warehouse.full_path', read_only=True)
    target_location_name = serializers.CharField(source='target_location.full_path', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    source = serializers.JSONField(read_only=True)

    class Meta:
        model = TransferRequest
        fields = [
            'id', 'created_at', 'component_id', 'component_name', 'quantity',
            'source_warehouse', 'source_warehouse_name', 'target_location', 'target_location_name',
            'status', 'note', 'source', 'requested_by_name', 'completed_at', 'completed_by_name',
        ]
        read_only_fields = ['id', 'created_at', 'completed_at']

    def _user_name(self, user):
        if not user:
            return None
        return user.get_full_name() or user.username

    def get_requested_by_name(self, obj):
        return self._user_name(obj.requested_by)

    def get_completed_by_name(self, obj):
        return self._user_name(obj.completed_by)

    def validate_source_warehouse(self, value):
        if not value.is_warehouse:
            raise serializers.ValidationError(f"Location '{value.full_path}' is not a warehouse.")
        return value

    def validate_target_location(self, value):
        if not (value.is_warehouse or value.can_store_items):
            raise serializers.ValidationError(
                f"Location '{value.full_path}' is neither a warehouse nor a storage position."
            )
        return value

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive.")
        return value

    def validate(self, attrs):
        source = attrs.get('source_warehouse') or getattr(self.instance, 'source_warehouse', None)
        target = attrs.get('target_location') or getattr(self.instance, 'target_location', None)
        if source and target and target.warehouse and target.warehouse.id == source.id:
            raise serializers.ValidationError("The target is inside the source warehouse.")
        return attrs

    def _user(self):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return user if user is not None and user.is_authenticated else None

    def create(self, validated_data):
        validated_data['requested_by'] = self._user()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        status = validated_data.get('status')
        if status and status != instance.status:
            if status == TransferStatus.OPEN:
                validated_data['completed_at'] = None
                validated_data['completed_by'] = None
            else:
                validated_data['completed_at'] = timezone.now()
                validated_data['completed_by'] = self._user()
        return super().update(instance, validated_data)


class TransferRequestPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 200


class TransferRequestListAPIView(generics.ListCreateAPIView):
    serializer_class = TransferRequestSerializer
    pagination_class = TransferRequestPagination
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'

    def get_queryset(self):
        queryset = TransferRequest.objects.select_related(
            'component', 'source_warehouse', 'target_location', 'requested_by', 'completed_by'
        )
        params = self.request.query_params
        status = params.get('status', 'open')
        if status != 'all':
            queryset = queryset.filter(status=status)
        if params.get('component'):
            queryset = queryset.filter(component_id=params['component'])
        if params.get('warehouse'):
            locations = Warehouse.objects.filter(id=params['warehouse']).get_descendants(include_self=True)
            queryset = queryset.filter(Q(source_warehouse_id=params['warehouse']) | Q(target_location__in=locations))
        if params.get('bom_id'):
            queryset = queryset.filter(source__bom_id=str(params['bom_id']))
        if params.get('search'):
            queryset = queryset.filter(
                Q(component__name__icontains=params['search']) | Q(note__icontains=params['search'])
            )
        return queryset.order_by('-created_at')


class TransferRequestDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TransferRequestSerializer
    queryset = TransferRequest.objects.select_related(
        'component', 'source_warehouse', 'target_location', 'requested_by', 'completed_by'
    )
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'
