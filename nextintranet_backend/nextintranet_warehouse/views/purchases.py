from django.db import transaction
from django.db.models import Count, Q
from rest_framework import generics, serializers
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated

from nextintranet_backend.permissions import AreaAccessPermission
from nextintranet_warehouse.models.component import Component, Supplier, SupplierRelation
from nextintranet_warehouse.models.purchase import Purchase, PurchaseItem


class SupplierSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ['id', 'name', 'website']


class PurchaseItemSerializer(serializers.ModelSerializer):
    component_id = serializers.UUIDField(source='component.id', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    supplier_relation_id = serializers.UUIDField(source='supplier_relation.id', read_only=True)
    supplier_relation_symbol = serializers.CharField(source='supplier_relation.symbol', read_only=True)

    class Meta:
        model = PurchaseItem
        fields = [
            'id',
            'component_id',
            'component_name',
            'supplier_relation_id',
            'supplier_relation_symbol',
            'symbol',
            'is_manual',
            'name',
            'description',
            'quantity',
            'package_size',
            'unit_price_original',
            'unit_price_converted',
            'delivered_quantity',
            'is_fully_delivered',
        ]


class PurchaseListSerializer(serializers.ModelSerializer):
    supplier = SupplierSummarySerializer(read_only=True)
    supplier_id = serializers.PrimaryKeyRelatedField(
        source='supplier',
        queryset=Supplier.objects.all(),
        write_only=True
    )
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    items_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Purchase
        fields = [
            'id',
            'supplier',
            'supplier_id',
            'status',
            'currency',
            'total_price_original',
            'total_price_original_vat',
            'total_price_converted',
            'note',
            'delivery_date',
            'stocked_date',
            'invoice',
            'created_at',
            'created_by_name',
            'items_count',
        ]


class PurchaseDetailSerializer(PurchaseListSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)

    class Meta(PurchaseListSerializer.Meta):
        fields = PurchaseListSerializer.Meta.fields + ['items']


class PurchasePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class PurchaseItemWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    supplier_relation_id = serializers.PrimaryKeyRelatedField(
        source='supplier_relation',
        queryset=SupplierRelation.objects.all(),
        required=False,
        allow_null=True
    )
    component_id = serializers.PrimaryKeyRelatedField(
        source='component',
        queryset=Component.objects.all(),
        required=False,
        allow_null=True
    )
    is_manual = serializers.BooleanField(required=False)
    name = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    unit_price_original = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True
    )
    unit_price_converted = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True
    )

    class Meta:
        model = PurchaseItem
        fields = [
            'id',
            'supplier_relation_id',
            'component_id',
            'symbol',
            'is_manual',
            'name',
            'description',
            'quantity',
            'package_size',
            'unit_price_original',
            'unit_price_converted',
            'delivered_quantity',
            'is_fully_delivered',
        ]

    def validate(self, attrs):
        if self.instance is None and attrs.get('quantity') in (None, ''):
            raise serializers.ValidationError({'quantity': 'This field is required.'})
        is_manual = attrs.get('is_manual', False)
        if is_manual:
            if not attrs.get('name'):
                raise serializers.ValidationError({'name': 'This field is required for manual items.'})
        else:
            if not attrs.get('supplier_relation'):
                raise serializers.ValidationError({'supplier_relation_id': 'This field is required.'})
        return attrs


class PurchaseWriteSerializer(PurchaseListSerializer):
    items = PurchaseItemWriteSerializer(many=True, required=False)
    remove_item_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True
    )

    class Meta(PurchaseListSerializer.Meta):
        fields = PurchaseListSerializer.Meta.fields + ['items', 'remove_item_ids']

    def _normalize_item(self, item_data, supplier):
        is_manual = item_data.get('is_manual', False)
        supplier_relation = item_data.get('supplier_relation')

        if not is_manual:
            if supplier_relation is None:
                raise serializers.ValidationError('Supplier relation is required for non-manual items.')
            if supplier_relation.supplier_id != supplier.id:
                raise serializers.ValidationError('Supplier relation does not match the order supplier.')

            if not item_data.get('component'):
                item_data['component'] = supplier_relation.component

            if not item_data.get('symbol'):
                item_data['symbol'] = supplier_relation.symbol or supplier_relation.component.name
        else:
            item_data['supplier_relation'] = None
            if not item_data.get('symbol'):
                item_data['symbol'] = item_data.get('name') or 'Custom item'

        if item_data.get('package_size') is None:
            item_data['package_size'] = 1

        if item_data.get('unit_price_original') is None:
            item_data['unit_price_original'] = 0

        if item_data.get('unit_price_converted') is None:
            item_data['unit_price_converted'] = item_data.get('unit_price_original')

        if item_data.get('delivered_quantity') is None:
            item_data['delivered_quantity'] = 0

        if item_data.get('is_fully_delivered') is None:
            item_data['is_fully_delivered'] = False

        return item_data

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data.pop('remove_item_ids', None)

        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user

        purchase = Purchase.objects.create(**validated_data)

        for item_data in items_data:
            normalized = self._normalize_item(item_data, purchase.supplier)
            PurchaseItem.objects.create(purchase=purchase, **normalized)

        return purchase

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        remove_item_ids = validated_data.pop('remove_item_ids', [])

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            existing_items = {item.id: item for item in instance.items.all()}
            for item_data in items_data:
                item_id = item_data.pop('id', None)
                normalized = self._normalize_item(item_data, instance.supplier)
                if item_id and item_id in existing_items:
                    item = existing_items[item_id]
                    for field, value in normalized.items():
                        setattr(item, field, value)
                    item.save()
                else:
                    PurchaseItem.objects.create(purchase=instance, **normalized)

        if remove_item_ids:
            PurchaseItem.objects.filter(purchase=instance, id__in=remove_item_ids).delete()

        return instance


class PurchaseListAPIView(generics.ListCreateAPIView):
    pagination_class = PurchasePagination
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PurchaseWriteSerializer
        return PurchaseListSerializer

    def get_queryset(self):
        queryset = Purchase.objects.select_related('supplier', 'created_by')
        search = self.request.query_params.get('search')
        status = self.request.query_params.get('status')
        supplier = self.request.query_params.get('supplier')

        if search:
            queryset = queryset.filter(
                Q(id__icontains=search) |
                Q(note__icontains=search) |
                Q(supplier__name__icontains=search)
            )

        if status:
            queryset = queryset.filter(status=status)

        if supplier:
            queryset = queryset.filter(supplier_id=supplier)

        return queryset.annotate(items_count=Count('items')).order_by('-created_at')


class PurchaseDetailAPIView(generics.RetrieveUpdateAPIView):
    queryset = Purchase.objects.select_related('supplier', 'created_by')\
        .prefetch_related('items__component')\
        .annotate(items_count=Count('items'))
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'read'
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return PurchaseWriteSerializer
        return PurchaseDetailSerializer
