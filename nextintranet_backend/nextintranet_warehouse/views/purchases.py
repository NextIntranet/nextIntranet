import csv
import io

from django.db import transaction
from django.db.models import Count, F, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nextintranet_backend.models.printList import PrintItem, PrintList
from nextintranet_backend.permissions import AreaAccessPermission
from nextintranet_warehouse.models.component import (
    Component,
    Packet,
    StockOperation,
    Supplier,
    SupplierRelation,
)
from nextintranet_warehouse.models.purchase import (
    Purchase,
    PurchaseDelivery,
    PurchaseExportMode,
    PurchaseItem,
    PurchaseItemType,
    PurchaseRequest,
    PurchaseStatus,
)
from nextintranet_warehouse.models.warehouse import Warehouse


class SupplierSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ['id', 'name', 'website']


class PurchaseDeliverySerializer(serializers.ModelSerializer):
    received_by_name = serializers.SerializerMethodField()
    stocked_by_name = serializers.SerializerMethodField()
    stock_location_id = serializers.UUIDField(source='stock_location.id', read_only=True, allow_null=True)
    stock_location_name = serializers.CharField(source='stock_location.full_path', read_only=True, allow_null=True)
    packet_id = serializers.UUIDField(source='packet.id', read_only=True, allow_null=True)

    class Meta:
        model = PurchaseDelivery
        fields = [
            'id',
            'delivery_date',
            'delivered_quantity',
            'note',
            'stock_location_id',
            'stock_location_name',
            'packet_id',
            'is_stocked',
            'labels_queued_at',
            'stocked_at',
            'received_by_name',
            'stocked_by_name',
        ]

    def get_received_by_name(self, obj):
        if not obj.received_by:
            return None
        full_name = obj.received_by.get_full_name()
        return full_name or obj.received_by.username

    def get_stocked_by_name(self, obj):
        if not obj.stocked_by:
            return None
        full_name = obj.stocked_by.get_full_name()
        return full_name or obj.stocked_by.username


class PurchaseItemSerializer(serializers.ModelSerializer):
    component_id = serializers.UUIDField(source='component.id', read_only=True)
    component_name = serializers.CharField(source='component.name', read_only=True)
    supplier_relation_id = serializers.UUIDField(source='supplier_relation.id', read_only=True)
    supplier_relation_symbol = serializers.CharField(source='supplier_relation.symbol', read_only=True)
    stock_location_id = serializers.UUIDField(source='stock_location.id', read_only=True)
    stock_location_name = serializers.CharField(source='stock_location.full_path', read_only=True)
    deliveries = PurchaseDeliverySerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseItem
        fields = [
            'id',
            'item_type',
            'component_id',
            'component_name',
            'supplier_relation_id',
            'supplier_relation_symbol',
            'symbol',
            'name',
            'description',
            'requested_quantity',
            'quantity',
            'package_size',
            'unit_price_original',
            'unit_price_converted',
            'delivered_quantity',
            'stocked_quantity',
            'is_fully_delivered',
            'stock_location_id',
            'stock_location_name',
            'deliveries',
        ]


class PurchaseListSerializer(serializers.ModelSerializer):
    supplier = SupplierSummarySerializer(read_only=True)
    supplier_id = serializers.PrimaryKeyRelatedField(
        source='supplier',
        queryset=Supplier.objects.all(),
        write_only=True,
    )
    created_by_name = serializers.SerializerMethodField()
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
            'export_mode',
            'note',
            'delivery_date',
            'stocked_date',
            'closed_at',
            'exported_at',
            'receiving_started_at',
            'stocking_started_at',
            'completed_at',
            'created_at',
            'created_by_name',
            'items_count',
        ]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        full_name = obj.created_by.get_full_name()
        return full_name or obj.created_by.username


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
        allow_null=True,
    )
    component_id = serializers.PrimaryKeyRelatedField(
        source='component',
        queryset=Component.objects.all(),
        required=False,
        allow_null=True,
    )
    stock_location_id = serializers.PrimaryKeyRelatedField(
        source='stock_location',
        queryset=Warehouse.objects.filter(can_store_items=True),
        required=False,
        allow_null=True,
    )
    item_type = serializers.ChoiceField(choices=PurchaseItemType.choices, required=False)
    name = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    symbol = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    unit_price_original = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    unit_price_converted = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = PurchaseItem
        fields = [
            'id',
            'item_type',
            'supplier_relation_id',
            'component_id',
            'symbol',
            'name',
            'description',
            'requested_quantity',
            'quantity',
            'package_size',
            'unit_price_original',
            'unit_price_converted',
            'delivered_quantity',
            'stocked_quantity',
            'is_fully_delivered',
            'stock_location_id',
        ]

    def validate(self, attrs):
        if self.instance is None and attrs.get('quantity') in (None, ''):
            raise serializers.ValidationError({'quantity': 'This field is required.'})

        quantity = attrs.get('quantity')
        delivered_quantity = attrs.get('delivered_quantity')
        stocked_quantity = attrs.get('stocked_quantity')
        package_size = attrs.get('package_size')

        if package_size is not None and package_size <= 0:
            raise serializers.ValidationError({'package_size': 'Package size must be greater than zero.'})

        if quantity is not None and quantity <= 0:
            raise serializers.ValidationError({'quantity': 'Quantity must be greater than zero.'})

        if delivered_quantity is not None and quantity is not None and delivered_quantity > quantity:
            raise serializers.ValidationError({'delivered_quantity': 'Delivered quantity cannot exceed ordered quantity.'})

        if stocked_quantity is not None and delivered_quantity is not None and stocked_quantity > delivered_quantity:
            raise serializers.ValidationError({'stocked_quantity': 'Stocked quantity cannot exceed delivered quantity.'})

        return attrs


class PurchaseWriteSerializer(PurchaseListSerializer):
    items = PurchaseItemWriteSerializer(many=True, required=False)
    remove_item_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
    )
    purchase_request_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
    )
    transition_to = serializers.ChoiceField(
        choices=PurchaseStatus.choices,
        required=False,
        write_only=True,
    )
    export_mode = serializers.ChoiceField(choices=PurchaseExportMode.choices, required=False)

    class Meta(PurchaseListSerializer.Meta):
        fields = PurchaseListSerializer.Meta.fields + [
            'items',
            'remove_item_ids',
            'purchase_request_ids',
            'transition_to',
        ]

    def _normalize_item(self, item_data, supplier):
        item_type = item_data.get('item_type', PurchaseItemType.COMPONENT)
        supplier_relation = item_data.get('supplier_relation')

        if item_type == PurchaseItemType.COMPONENT:
            if supplier_relation and supplier_relation.supplier_id != supplier.id:
                raise serializers.ValidationError(
                    {'detail': 'Supplier relation does not match purchase supplier.'}
                )

            if not item_data.get('component') and supplier_relation:
                item_data['component'] = supplier_relation.component

            component = item_data.get('component')
            if component is None:
                raise serializers.ValidationError('Component item requires a component.')

            if supplier_relation and supplier_relation.component_id != component.id:
                raise serializers.ValidationError('Supplier relation does not match selected component.')

            if not item_data.get('symbol'):
                item_data['symbol'] = (
                    supplier_relation.symbol
                    if supplier_relation and supplier_relation.symbol
                    else component.name
                )

            item_data['name'] = ''
        else:
            name = (item_data.get('name') or '').strip()
            if not name:
                raise serializers.ValidationError('Non-stock item requires item name.')
            item_data['name'] = name
            item_data['component'] = None
            item_data['supplier_relation'] = None
            item_data['stock_location'] = None
            item_data['stocked_quantity'] = 0
            if not item_data.get('symbol'):
                item_data['symbol'] = name

        if item_data.get('requested_quantity') is None:
            item_data['requested_quantity'] = 0

        if item_data.get('package_size') is None:
            item_data['package_size'] = 1

        if item_data.get('delivered_quantity') is None:
            item_data['delivered_quantity'] = 0

        if item_data.get('stocked_quantity') is None:
            item_data['stocked_quantity'] = 0

        if item_data.get('unit_price_converted') is None and item_data.get('unit_price_original') is not None:
            item_data['unit_price_converted'] = item_data['unit_price_original']

        delivered_quantity = item_data['delivered_quantity']
        quantity = item_data.get('quantity')

        if quantity is None or quantity <= 0:
            raise serializers.ValidationError('Item quantity must be greater than zero.')
        if delivered_quantity > quantity:
            raise serializers.ValidationError('Delivered quantity cannot exceed ordered quantity.')
        if item_data['stocked_quantity'] > delivered_quantity:
            raise serializers.ValidationError('Stocked quantity cannot exceed delivered quantity.')

        item_data['is_fully_delivered'] = delivered_quantity >= quantity

        return item_data

    def _assign_purchase_requests(self, purchase, request_ids):
        if not request_ids:
            return
        PurchaseRequest.objects.filter(id__in=request_ids).update(purchase=purchase)

    def _resolve_transition_target(self, instance, validated_data):
        requested_status = validated_data.pop('status', None)
        explicit_transition = validated_data.pop('transition_to', None)

        if requested_status and explicit_transition and requested_status != explicit_transition:
            raise serializers.ValidationError({'status': 'status and transition_to must match when both are set.'})

        target = explicit_transition or requested_status
        if target is None:
            return None
        if instance and target == instance.status:
            return None
        return target

    def _ensure_supplier_consistency(self, purchase):
        invalid_relation_exists = purchase.items.filter(
            item_type=PurchaseItemType.COMPONENT,
            supplier_relation__isnull=False,
        ).exclude(supplier_relation__supplier_id=purchase.supplier_id).exists()
        if invalid_relation_exists:
            raise serializers.ValidationError(
                {'supplier_id': 'Existing component items contain supplier relation from a different supplier.'}
            )

    @staticmethod
    def _current_item_data(item: PurchaseItem):
        return {
            'item_type': item.item_type,
            'supplier_relation': item.supplier_relation,
            'component': item.component,
            'symbol': item.symbol,
            'name': item.name,
            'description': item.description,
            'requested_quantity': item.requested_quantity,
            'quantity': item.quantity,
            'package_size': item.package_size,
            'unit_price_original': item.unit_price_original,
            'unit_price_converted': item.unit_price_converted,
            'delivered_quantity': item.delivered_quantity,
            'stocked_quantity': item.stocked_quantity,
            'is_fully_delivered': item.is_fully_delivered,
            'stock_location': item.stock_location,
        }

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data.pop('remove_item_ids', None)
        request_ids = validated_data.pop('purchase_request_ids', [])

        transition_target = self._resolve_transition_target(None, validated_data)

        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user

        purchase = Purchase.objects.create(**validated_data)

        for item_data in items_data:
            normalized = self._normalize_item(item_data, purchase.supplier)
            item = PurchaseItem(purchase=purchase, **normalized)
            item.full_clean()
            item.save()

        self._assign_purchase_requests(purchase, request_ids)

        if transition_target:
            purchase.transition_to(transition_target)

        return purchase

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        remove_item_ids = validated_data.pop('remove_item_ids', [])
        request_ids = validated_data.pop('purchase_request_ids', [])
        transition_target = self._resolve_transition_target(instance, validated_data)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            existing_items = {item.id: item for item in instance.items.all()}

            for item_data in items_data:
                item_id = item_data.pop('id', None)

                if item_id and item_id in existing_items:
                    item = existing_items[item_id]
                    merged = self._current_item_data(item)
                    merged.update(item_data)
                    normalized = self._normalize_item(merged, instance.supplier)

                    for field, value in normalized.items():
                        setattr(item, field, value)
                    item.full_clean()
                    item.save()
                else:
                    normalized = self._normalize_item(item_data, instance.supplier)
                    item = PurchaseItem(purchase=instance, **normalized)
                    item.full_clean()
                    item.save()

        if remove_item_ids:
            PurchaseItem.objects.filter(purchase=instance, id__in=remove_item_ids).delete()

        self._ensure_supplier_consistency(instance)
        self._assign_purchase_requests(instance, request_ids)

        if transition_target:
            instance.transition_to(transition_target)

        return instance


class PurchaseReceiveLineSerializer(serializers.Serializer):
    purchase_item_id = serializers.PrimaryKeyRelatedField(queryset=PurchaseItem.objects.select_related('purchase'))
    delivered_quantity = serializers.IntegerField(min_value=1)
    stock_location_id = serializers.PrimaryKeyRelatedField(
        source='stock_location',
        queryset=Warehouse.objects.filter(can_store_items=True),
        required=False,
        allow_null=True,
    )
    delivery_date = serializers.DateField(required=False)
    note = serializers.CharField(required=False, allow_blank=True)


class PurchaseReceiveSerializer(serializers.Serializer):
    lines = PurchaseReceiveLineSerializer(many=True)
    queue_labels = serializers.BooleanField(required=False, default=False)
    print_list = serializers.UUIDField(required=False, allow_null=True)

    def validate_lines(self, lines):
        purchase = self.context['purchase']
        if not lines:
            raise serializers.ValidationError('At least one line is required.')
        totals = {}

        for line in lines:
            item = line['purchase_item_id']
            qty = line['delivered_quantity']
            stock_location = line.get('stock_location')

            if item.purchase_id != purchase.id:
                raise serializers.ValidationError('All items must belong to the selected purchase.')

            totals[item.id] = totals.get(item.id, 0) + qty
            if item.delivered_quantity + totals[item.id] > item.quantity:
                raise serializers.ValidationError(
                    f'Received quantity exceeds ordered quantity for item {item.id}.'
                )

            if item.item_type == PurchaseItemType.COMPONENT:
                if not stock_location:
                    raise serializers.ValidationError(
                        f'Stock location is required for component item {item.id}.'
                    )
                if not item.component_id:
                    raise serializers.ValidationError(
                        f'Component item {item.id} has no component and cannot create packet.'
                    )
            elif stock_location:
                raise serializers.ValidationError(
                    f'Non-stock item {item.id} cannot define stock location.'
                )

        return lines


class PurchaseStockLineSerializer(serializers.Serializer):
    purchase_delivery_id = serializers.PrimaryKeyRelatedField(
        source='purchase_delivery',
        queryset=PurchaseDelivery.objects.select_related('purchase_item__purchase', 'purchase_item__component', 'packet'),
    )
    confirm_stocked = serializers.BooleanField(required=False, default=True)


class PurchaseStockSerializer(serializers.Serializer):
    lines = PurchaseStockLineSerializer(many=True)

    def validate_lines(self, lines):
        purchase = self.context['purchase']
        if not lines:
            raise serializers.ValidationError('At least one line is required.')
        seen_delivery_ids = set()
        confirmed_count = 0

        for line in lines:
            delivery = line['purchase_delivery']
            item = delivery.purchase_item

            if item.purchase_id != purchase.id:
                raise serializers.ValidationError('All deliveries must belong to the selected purchase.')

            if not line.get('confirm_stocked', True):
                continue

            if delivery.id in seen_delivery_ids:
                raise serializers.ValidationError(f'Delivery {delivery.id} is duplicated in request.')
            seen_delivery_ids.add(delivery.id)
            confirmed_count += 1

            if delivery.is_stocked:
                raise serializers.ValidationError(f'Delivery {delivery.id} is already stocked.')

            if item.item_type != PurchaseItemType.COMPONENT:
                raise serializers.ValidationError(f'Delivery {delivery.id} is non-stock and cannot be stocked.')
            if not delivery.packet_id:
                raise serializers.ValidationError(
                    f'Delivery {delivery.id} has no packet. Receive goods first with stock location.'
                )

        if confirmed_count == 0:
            raise serializers.ValidationError('Select at least one delivery to confirm stocking.')

        return lines


def purchase_ready_for_completion(purchase: Purchase) -> bool:
    items = purchase.items.all()
    if not items.exists():
        return False

    if items.filter(quantity__lte=0).exists():
        return False

    if items.filter(item_type=PurchaseItemType.COMPONENT, delivered_quantity__lt=F('quantity')).exists():
        return False

    if items.filter(item_type=PurchaseItemType.COMPONENT, stocked_quantity__lt=F('delivered_quantity')).exists():
        return False

    if items.filter(
        item_type=PurchaseItemType.COMPONENT,
        stocked_quantity__gt=0,
        stock_location__isnull=True,
    ).exists():
        return False

    if items.filter(item_type=PurchaseItemType.NON_STOCK, delivered_quantity__lt=F('quantity')).exists():
        return False

    return True


def resolve_print_queue(user, queue_id):
    if queue_id:
        queue = PrintList.objects.filter(id=queue_id, owner=user).first()
        if queue:
            return queue
        return PrintList.objects.filter(id=queue_id, is_public=True).first()

    queue = PrintList.objects.filter(owner=user, is_default=True).first()
    if queue:
        return queue
    return PrintList.objects.filter(is_public=True, is_default=True).first()


class PurchaseListAPIView(generics.ListCreateAPIView):
    pagination_class = PurchasePagination
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse-operations'
    required_level = 'read'

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PurchaseWriteSerializer
        return PurchaseListSerializer

    def get_queryset(self):
        queryset = Purchase.objects.select_related('supplier', 'created_by')
        search = self.request.query_params.get('search')
        status_filter = self.request.query_params.get('status')
        supplier = self.request.query_params.get('supplier')

        if search:
            queryset = queryset.filter(
                Q(id__icontains=search)
                | Q(note__icontains=search)
                | Q(supplier__name__icontains=search)
            )

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if supplier:
            queryset = queryset.filter(supplier_id=supplier)

        return queryset.annotate(items_count=Count('items')).order_by('-created_at')


class PurchaseDetailAPIView(generics.RetrieveUpdateAPIView):
    queryset = (
        Purchase.objects.select_related('supplier', 'created_by')
        .prefetch_related('items__component', 'items__supplier_relation', 'items__stock_location', 'items__deliveries')
        .annotate(items_count=Count('items'))
    )
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse-operations'
    required_level = 'read'
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return PurchaseWriteSerializer
        return PurchaseDetailSerializer


class PurchaseReceiveAPIView(APIView):
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse-operations'
    required_level = 'read'
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    @transaction.atomic
    def post(self, request, pk):
        purchase = get_object_or_404(
            Purchase.objects.prefetch_related('items__component'),
            pk=pk,
        )

        if purchase.status not in {PurchaseStatus.EXPORTED, PurchaseStatus.RECEIVING, PurchaseStatus.STOCKING}:
            return Response(
                {'detail': 'Purchase must be in exported, receiving, or stocking status before receiving goods.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PurchaseReceiveSerializer(data=request.data, context={'purchase': purchase})
        serializer.is_valid(raise_exception=True)

        queue_labels = serializer.validated_data.get('queue_labels', False)
        print_queue = None
        if queue_labels:
            print_list_id = serializer.validated_data.get('print_list')
            print_queue = resolve_print_queue(request.user, print_list_id)
            if not print_queue:
                return Response(
                    {'detail': 'No print queue available. Select a print queue or configure a default one.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        created_packets = []
        queued_label_count = 0
        now = timezone.now()

        for line in serializer.validated_data['lines']:
            item = line['purchase_item_id']
            qty = line['delivered_quantity']
            stock_location = line.get('stock_location')

            packet = None
            labels_queued_at = None
            if item.item_type == PurchaseItemType.COMPONENT:
                packet = Packet.objects.create(
                    component=item.component,
                    location=stock_location,
                    description=f'Purchase {purchase.id} item {item.id} delivery',
                )
                created_packets.append(packet)
                item.stock_location = stock_location

                if queue_labels and print_queue:
                    PrintItem.objects.create(
                        print_list=print_queue,
                        kind=PrintItem.KIND_LABEL,
                        status=PrintItem.STATUS_QUEUED,
                        content_object=packet,
                        payload={
                            'source': 'purchase',
                            'purchase_id': str(purchase.id),
                            'purchase_item_id': item.id,
                        },
                    )
                    queued_label_count += 1
                    labels_queued_at = now

            PurchaseDelivery.objects.create(
                purchase_item=item,
                delivery_date=line.get('delivery_date') or timezone.now().date(),
                delivered_quantity=qty,
                note=line.get('note', ''),
                stock_location=stock_location,
                packet=packet,
                labels_queued_at=labels_queued_at,
                received_by=request.user if request.user.is_authenticated else None,
            )

            item.delivered_quantity += qty
            item.is_fully_delivered = item.delivered_quantity >= item.quantity
            item.full_clean()
            item_update_fields = ['delivered_quantity', 'is_fully_delivered']
            if item.item_type == PurchaseItemType.COMPONENT:
                item_update_fields.append('stock_location')
            item.save(update_fields=item_update_fields)

        if purchase.status == PurchaseStatus.EXPORTED:
            purchase.transition_to(PurchaseStatus.RECEIVING)

        purchase.refresh_from_db()
        data = PurchaseDetailSerializer(purchase, context={'request': request}).data
        data['created_packets'] = [
            {
                'id': str(packet.id),
                'component_id': str(packet.component_id),
                'location_id': str(packet.location_id) if packet.location_id else None,
            }
            for packet in created_packets
        ]
        data['queued_labels'] = queued_label_count
        data['print_list_id'] = str(print_queue.id) if print_queue else None
        return Response(data, status=status.HTTP_200_OK)


class PurchaseStockAPIView(APIView):
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse-operations'
    required_level = 'read'
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    @transaction.atomic
    def post(self, request, pk):
        purchase = get_object_or_404(
            Purchase.objects.prefetch_related('items'),
            pk=pk,
        )

        if purchase.status not in {PurchaseStatus.RECEIVING, PurchaseStatus.STOCKING}:
            return Response(
                {'detail': 'Purchase must be in receiving or stocking status before stocking items.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PurchaseStockSerializer(data=request.data, context={'purchase': purchase})
        serializer.is_valid(raise_exception=True)

        if purchase.status == PurchaseStatus.RECEIVING:
            purchase.transition_to(PurchaseStatus.STOCKING)

        item_totals: dict[int, int] = {}
        stocked_count = 0
        now = timezone.now()

        for line in serializer.validated_data['lines']:
            if not line.get('confirm_stocked', True):
                continue
            delivery = line['purchase_delivery']
            item = delivery.purchase_item
            qty = delivery.delivered_quantity

            unit_price_value = item.unit_price_converted
            if unit_price_value is None:
                unit_price_value = item.unit_price_original
            unit_price = float(unit_price_value or 0)

            StockOperation.objects.create(
                packet=delivery.packet,
                operation_type='buy',
                quantity=float(qty),
                relative_quantity=True,
                unit_price=unit_price,
                description=f'Purchase {purchase.id} stocking',
                author=request.user if request.user.is_authenticated else None,
                reference=purchase.id,
            )

            delivery.is_stocked = True
            delivery.stocked_at = now
            delivery.stocked_by = request.user if request.user.is_authenticated else None
            delivery.save(update_fields=['is_stocked', 'stocked_at', 'stocked_by'])
            stocked_count += 1

            item_totals[item.id] = item_totals.get(item.id, 0) + qty

        if item_totals:
            items_by_id = {item.id: item for item in purchase.items.all()}
            for item_id, qty in item_totals.items():
                item = items_by_id.get(item_id)
                if not item:
                    continue
                item.stocked_quantity += qty
                item.full_clean()
                item.save(update_fields=['stocked_quantity'])

        purchase.refresh_from_db()

        if purchase_ready_for_completion(purchase):
            purchase.transition_to(PurchaseStatus.COMPLETED)
            purchase.refresh_from_db()

        data = PurchaseDetailSerializer(purchase, context={'request': request}).data
        data['stocked_deliveries'] = stocked_count
        return Response(data, status=status.HTTP_200_OK)


MFPN_PARAM_NAMES = {'mfpn', 'mpn', 'manufacturer part number', 'symbol/mfpn', 'symbol mfpn'}


def _get_component_mfpn(component):
    if not component:
        return ''
    for param in component.parameters.select_related('parameter_type').all():
        if not param.parameter_type or not param.value:
            continue
        name = (param.parameter_type.name or '').strip().lower()
        if name in MFPN_PARAM_NAMES:
            return (param.value or '').strip()
    return ''


class PurchaseExportCSVAPIView(APIView):
    """Export purchase items as CSV for supplier import (e.g. Mouser)."""
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse-operations'
    required_level = 'read'

    def get(self, request, pk):
        purchase = get_object_or_404(
            Purchase.objects.prefetch_related(
                'items__component__parameters__parameter_type',
            ),
            pk=pk,
        )
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(['mouser_part_number', 'MFPN', 'Quantity', 'Customer_reference', 'Internal_id'])
        for item in purchase.items.all():
            mouser_part_number = (item.symbol or '').strip()
            mfpn = _get_component_mfpn(item.component) if item.component_id else ''
            quantity = item.quantity
            customer_reference = (item.description or '').strip()
            internal_id = str(item.component_id) if item.component_id else str(item.id)
            writer.writerow([mouser_part_number, mfpn, quantity, customer_reference, internal_id])
        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type='text/csv; charset=utf-8')
        short_id = str(purchase.id).replace('-', '')[:8]
        response['Content-Disposition'] = f'attachment; filename="purchase-{short_id}-supplier.csv"'
        return response
