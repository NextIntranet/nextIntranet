from django.db.models import Q
from rest_framework import generics, serializers, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from nextintranet_backend.permissions import AreaAccessPermission
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from nextintranet_warehouse.models.component import Component, SupplierRelation
from nextintranet_warehouse.models.purchase import Purchase, PurchaseRequest, PurchaseRequestFolder
from nextintranet_warehouse.models.warehouse import Warehouse


class SupplierRelationSummarySerializer(serializers.ModelSerializer):
    supplier_id = serializers.UUIDField(source='supplier.id', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = SupplierRelation
        fields = ['id', 'supplier_id', 'supplier_name', 'symbol']


class PurchaseRequestFolderSerializer(serializers.ModelSerializer):
    full_path = serializers.CharField(read_only=True)

    class Meta:
        model = PurchaseRequestFolder
        fields = ['id', 'name', 'parent', 'full_path']


class PurchaseRequestFolderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseRequestFolderSerializer
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'
    queryset = PurchaseRequestFolder.objects.all()


PurchaseRequestFolderRouter = DefaultRouter(trailing_slash=True)
PurchaseRequestFolderRouter.register(r'', PurchaseRequestFolderViewSet, basename='purchase-request-folder')


class PurchaseRequestSerializer(serializers.ModelSerializer):
    component_id = serializers.PrimaryKeyRelatedField(
        source='component',
        queryset=Component.objects.all(),
        required=False,
        allow_null=True
    )
    component_name = serializers.CharField(source='component.name', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    purchase_id = serializers.PrimaryKeyRelatedField(
        source='purchase',
        queryset=Purchase.objects.all(),
        required=False,
        allow_null=True
    )
    folder_id = serializers.PrimaryKeyRelatedField(
        source='folder',
        queryset=PurchaseRequestFolder.objects.all(),
        required=False,
        allow_null=True
    )
    target_location = serializers.PrimaryKeyRelatedField(
        queryset=Warehouse.objects.all(),
        required=False,
        allow_null=True,
    )
    target_location_name = serializers.SerializerMethodField()
    source = serializers.JSONField(read_only=True)
    suppliers = serializers.SerializerMethodField()
    mfpn = serializers.SerializerMethodField()
    matching_supplier_relation_id = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseRequest
        fields = [
            'id',
            'component_id',
            'component_name',
            'item_name',
            'quantity',
            'description',
            'requested_by_name',
            'purchase_id',
            'folder_id',
            'target_location',
            'target_location_name',
            'source',
            'suppliers',
            'mfpn',
            'matching_supplier_relation_id',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'component_name',
            'requested_by_name',
            'suppliers',
            'mfpn',
            'matching_supplier_relation_id',
            'created_at',
        ]

    def get_target_location_name(self, obj):
        return obj.target_location.full_path if obj.target_location_id else None

    def validate_target_location(self, value):
        if value is not None and not (value.is_warehouse or value.can_store_items):
            raise serializers.ValidationError(
                f"Location '{value.full_path}' is neither a warehouse nor a storage position."
            )
        return value

    def get_suppliers(self, obj):
        if not obj.component:
            return []
        relations = obj.component.suppliers.all()
        return SupplierRelationSummarySerializer(relations, many=True).data

    def get_mfpn(self, obj):
        if not obj.component:
            return None
        name_candidates = {'mfpn', 'mpn', 'manufacturer part number', 'symbol/mfpn', 'symbol mfpn'}
        for param in obj.component.parameters.all():
            if not param.parameter_type or not param.value:
                continue
            name = param.parameter_type.name.strip().lower()
            if name in name_candidates:
                return param.value
        return None

    def get_matching_supplier_relation_id(self, obj):
        if not obj.component:
            return None
        supplier_id = self.context.get('supplier_id')
        if not supplier_id:
            return None
        for relation in obj.component.suppliers.all():
            if str(relation.supplier_id) == str(supplier_id):
                return relation.id
        return None

    def get_requested_by_name(self, obj):
        if not obj.requested_by:
            return None
        full_name = obj.requested_by.get_full_name()
        return full_name or obj.requested_by.username

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['requested_by'] = request.user
        return super().create(validated_data)


class PurchaseRequestPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class PurchaseRequestListAPIView(generics.ListCreateAPIView):
    serializer_class = PurchaseRequestSerializer
    pagination_class = PurchaseRequestPagination
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'

    def get_queryset(self):
        queryset = PurchaseRequest.objects.select_related('component', 'requested_by', 'purchase', 'folder', 'target_location')\
            .prefetch_related('component__suppliers__supplier', 'component__parameters__parameter_type')
        search = self.request.query_params.get('search')
        supplier = self.request.query_params.get('supplier')
        component = self.request.query_params.get('component')
        assigned = self.request.query_params.get('assigned')
        target_location = self.request.query_params.get('target_location')
        bom_id = self.request.query_params.get('bom_id')

        if assigned is None or assigned.lower() in ('0', 'false', ''):
            queryset = queryset.filter(purchase__isnull=True)
        elif assigned.lower() in ('1', 'true'):
            queryset = queryset.filter(purchase__isnull=False)

        if search:
            queryset = queryset.filter(
                Q(component__name__icontains=search) |
                Q(description__icontains=search) |
                Q(requested_by__username__icontains=search)
            )

        if supplier:
            queryset = queryset.filter(component__suppliers__supplier_id=supplier)

        if component:
            queryset = queryset.filter(component_id=component)

        if target_location:
            locations = Warehouse.objects.filter(id=target_location).get_descendants(include_self=True)
            queryset = queryset.filter(target_location__in=locations)

        if bom_id:
            queryset = queryset.filter(source__bom_id=str(bom_id))

        return queryset.distinct().order_by('-created_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            context['supplier_id'] = supplier_id
        return context


class PurchaseRequestDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PurchaseRequestSerializer
    queryset = PurchaseRequest.objects.select_related('component', 'requested_by', 'purchase', 'folder', 'target_location')\
        .prefetch_related('component__suppliers__supplier', 'component__parameters__parameter_type')
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'
