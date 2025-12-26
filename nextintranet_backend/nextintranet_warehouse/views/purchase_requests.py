from django.db.models import Q
from rest_framework import generics, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from nextintranet_backend.permissions import AreaAccessPermission
from nextintranet_warehouse.models.component import Component, SupplierRelation
from nextintranet_warehouse.models.purchase import Purchase, PurchaseRequest


class SupplierRelationSummarySerializer(serializers.ModelSerializer):
    supplier_id = serializers.UUIDField(source='supplier.id', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = SupplierRelation
        fields = ['id', 'supplier_id', 'supplier_name', 'symbol']


class PurchaseRequestSerializer(serializers.ModelSerializer):
    component_id = serializers.PrimaryKeyRelatedField(
        source='component',
        queryset=Component.objects.all()
    )
    component_name = serializers.CharField(source='component.name', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    purchase_id = serializers.PrimaryKeyRelatedField(
        source='purchase',
        queryset=Purchase.objects.all(),
        required=False,
        allow_null=True
    )
    suppliers = serializers.SerializerMethodField()
    mfpn = serializers.SerializerMethodField()
    matching_supplier_relation_id = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseRequest
        fields = [
            'id',
            'component_id',
            'component_name',
            'quantity',
            'description',
            'requested_by_name',
            'purchase_id',
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

    def get_suppliers(self, obj):
        relations = obj.component.suppliers.all()
        return SupplierRelationSummarySerializer(relations, many=True).data

    def get_mfpn(self, obj):
        name_candidates = {'mfpn', 'mpn', 'manufacturer part number', 'symbol/mfpn', 'symbol mfpn'}
        for param in obj.component.parameters.all():
            if not param.parameter_type or not param.value:
                continue
            name = param.parameter_type.name.strip().lower()
            if name in name_candidates:
                return param.value
        return None

    def get_matching_supplier_relation_id(self, obj):
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
        queryset = PurchaseRequest.objects.select_related('component', 'requested_by', 'purchase')\
            .prefetch_related('component__suppliers__supplier', 'component__parameters__parameter_type')
        search = self.request.query_params.get('search')
        supplier = self.request.query_params.get('supplier')
        component = self.request.query_params.get('component')
        assigned = self.request.query_params.get('assigned')

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

        return queryset.distinct().order_by('-created_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            context['supplier_id'] = supplier_id
        return context


class PurchaseRequestDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PurchaseRequestSerializer
    queryset = PurchaseRequest.objects.select_related('component', 'requested_by', 'purchase')\
        .prefetch_related('component__suppliers__supplier', 'component__parameters__parameter_type')
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'
