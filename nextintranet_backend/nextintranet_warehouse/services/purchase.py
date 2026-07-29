"""Purchase lifecycle operations shared by the REST views and the MCP toolset.

The whole flow lives here: building the order, exporting it (which materialises the
draft packets), receiving goods (including partial deliveries) and stocking them.
Callers are responsible for their own permission checks.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from nextintranet_backend.models.printList import PrintItem, PrintList
from nextintranet_warehouse.models.component import Packet, PacketState, StockOperation
from nextintranet_warehouse.models.purchase import (
    Purchase,
    PurchaseDelivery,
    PurchaseItem,
    PurchaseItemType,
    PurchaseRequest,
    PurchaseStatus,
)
from nextintranet_warehouse.models.warehouse import Warehouse

RECEIVABLE_STATUSES = {PurchaseStatus.EXPORTED, PurchaseStatus.RECEIVING, PurchaseStatus.STOCKING}
STOCKABLE_STATUSES = {PurchaseStatus.RECEIVING, PurchaseStatus.STOCKING}

MFPN_PARAM_NAMES = {'mfpn', 'mpn', 'manufacturer part number', 'symbol/mfpn', 'symbol mfpn'}


@dataclass
class ReceiveLine:
    """One receiving line: how much of a purchase item physically arrived."""

    item: PurchaseItem
    quantity: int
    stock_location: Warehouse | None = None
    delivery_date: date | None = None
    note: str = ''


@dataclass
class ReceiveResult:
    deliveries: list[PurchaseDelivery] = field(default_factory=list)
    packets: list[Packet] = field(default_factory=list)
    queued_labels: int = 0
    print_queue: PrintList | None = None


@dataclass
class StockResult:
    stocked_deliveries: int = 0
    packets: list[Packet] = field(default_factory=list)
    completed: bool = False


# --------------------------------------------------------------------------- #
# Draft packets
# --------------------------------------------------------------------------- #

def ensure_draft_packets(purchase: Purchase) -> list[Packet]:
    """Create the expected (draft) packet for every component item of the purchase.

    Called when the order is exported, so labels can be printed and locations
    reserved before the goods arrive. Idempotent.
    """
    created: list[Packet] = []

    items = purchase.items.select_related('component', 'stock_location', 'draft_packet').filter(
        item_type=PurchaseItemType.COMPONENT,
    )
    for item in items:
        if item.draft_packet_id or not item.component_id or not item.stock_location_id:
            continue
        packet = Packet.objects.create(
            component=item.component,
            location=item.stock_location,
            state=PacketState.EXPECTED,
            description=f'Purchase {purchase.id} item {item.id}',
        )
        item.draft_packet = packet
        item.save(update_fields=['draft_packet'])
        created.append(packet)

    return created


def packet_for_item(item: PurchaseItem, stock_location: Warehouse | None) -> Packet:
    """Return the packet goods for this item land in, creating it when missing.

    Normally this is the draft packet created on export; a purchase received without
    ever being exported (or an item added later) gets its packet here instead.
    """
    location = stock_location or item.stock_location
    packet = item.draft_packet
    if packet is None:
        packet = Packet.objects.create(
            component=item.component,
            location=location,
            state=PacketState.EXPECTED,
            description=f'Purchase {item.purchase_id} item {item.id}',
        )
        item.draft_packet = packet
        item.save(update_fields=['draft_packet'])
    elif location and packet.location_id != location.id and packet.state == PacketState.EXPECTED:
        packet.location = location
        packet.save(update_fields=['location'])

    return packet


# --------------------------------------------------------------------------- #
# Status transitions
# --------------------------------------------------------------------------- #

def transition_purchase(purchase: Purchase, target_status: str) -> Purchase:
    """Move the purchase to target_status, materialising draft packets on export."""
    with transaction.atomic():
        purchase.transition_to(target_status)
        if purchase.status == PurchaseStatus.EXPORTED:
            ensure_draft_packets(purchase)
    return purchase


def assign_requests_to_purchase(purchase: Purchase, request_ids) -> int:
    if not request_ids:
        return 0
    return PurchaseRequest.objects.filter(id__in=list(request_ids)).update(purchase=purchase)


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


# --------------------------------------------------------------------------- #
# Receiving
# --------------------------------------------------------------------------- #

def validate_receive_lines(purchase: Purchase, lines: list[ReceiveLine]) -> list[ReceiveLine]:
    if not lines:
        raise ValidationError('At least one line is required.')

    if purchase.status not in RECEIVABLE_STATUSES:
        raise ValidationError(
            'Purchase must be in exported, receiving, or stocking status before receiving goods.'
        )

    totals: dict[int, int] = {}
    for line in lines:
        item = line.item
        if item.purchase_id != purchase.id:
            raise ValidationError('All items must belong to the selected purchase.')
        if line.quantity is None or line.quantity < 1:
            raise ValidationError(f'Received quantity must be at least 1 for item {item.id}.')

        totals[item.id] = totals.get(item.id, 0) + line.quantity
        if item.delivered_quantity + totals[item.id] > item.quantity:
            raise ValidationError(f'Received quantity exceeds ordered quantity for item {item.id}.')

        if item.item_type == PurchaseItemType.COMPONENT:
            if not (line.stock_location or item.stock_location_id):
                raise ValidationError(f'Stock location is required for component item {item.id}.')
            if not item.component_id:
                raise ValidationError(f'Component item {item.id} has no component and cannot create packet.')
        elif line.stock_location:
            raise ValidationError(f'Non-stock item {item.id} cannot define stock location.')

    return lines


def receive_purchase(
    purchase: Purchase,
    lines: list[ReceiveLine],
    *,
    actor=None,
    print_queue: PrintList | None = None,
) -> ReceiveResult:
    """Record deliveries for the given lines. Supports partial receipt."""
    validate_receive_lines(purchase, lines)

    result = ReceiveResult(print_queue=print_queue)
    now = timezone.now()

    with transaction.atomic():
        for line in lines:
            item = line.item
            packet = None
            labels_queued_at = None

            if item.item_type == PurchaseItemType.COMPONENT:
                packet = packet_for_item(item, line.stock_location)
                result.packets.append(packet)
                if line.stock_location:
                    item.stock_location = line.stock_location

                if print_queue:
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
                    result.queued_labels += 1
                    labels_queued_at = now

            delivery = PurchaseDelivery.objects.create(
                purchase_item=item,
                delivery_date=line.delivery_date or now.date(),
                delivered_quantity=line.quantity,
                note=line.note or '',
                stock_location=line.stock_location or item.stock_location,
                packet=packet,
                labels_queued_at=labels_queued_at,
                received_by=actor,
            )
            result.deliveries.append(delivery)

            item.delivered_quantity += line.quantity
            item.is_fully_delivered = item.delivered_quantity >= item.quantity
            item.full_clean()
            update_fields = ['delivered_quantity', 'is_fully_delivered']
            if item.item_type == PurchaseItemType.COMPONENT:
                update_fields.append('stock_location')
            item.save(update_fields=update_fields)

        if purchase.status == PurchaseStatus.EXPORTED:
            purchase.transition_to(PurchaseStatus.RECEIVING)

    return result


# --------------------------------------------------------------------------- #
# Stocking
# --------------------------------------------------------------------------- #

def validate_stock_deliveries(purchase: Purchase, deliveries: list[PurchaseDelivery]) -> list[PurchaseDelivery]:
    if not deliveries:
        raise ValidationError('Select at least one delivery to confirm stocking.')

    if purchase.status not in STOCKABLE_STATUSES:
        raise ValidationError('Purchase must be in receiving or stocking status before stocking items.')

    seen: set[int] = set()
    for delivery in deliveries:
        item = delivery.purchase_item
        if item.purchase_id != purchase.id:
            raise ValidationError('All deliveries must belong to the selected purchase.')
        if delivery.id in seen:
            raise ValidationError(f'Delivery {delivery.id} is duplicated in request.')
        seen.add(delivery.id)
        if delivery.is_stocked:
            raise ValidationError(f'Delivery {delivery.id} is already stocked.')
        if item.item_type != PurchaseItemType.COMPONENT:
            raise ValidationError(f'Delivery {delivery.id} is non-stock and cannot be stocked.')
        if not delivery.packet_id:
            raise ValidationError(
                f'Delivery {delivery.id} has no packet. Receive goods first with stock location.'
            )

    return deliveries


def stock_purchase(purchase: Purchase, deliveries: list[PurchaseDelivery], *, actor=None) -> StockResult:
    """Book the received goods into stock and flip their packets to stocked."""
    validate_stock_deliveries(purchase, deliveries)

    result = StockResult()
    now = timezone.now()

    with transaction.atomic():
        if purchase.status == PurchaseStatus.RECEIVING:
            purchase.transition_to(PurchaseStatus.STOCKING)

        item_totals: dict[int, int] = {}

        for delivery in deliveries:
            item = delivery.purchase_item
            qty = delivery.delivered_quantity

            unit_price_value = item.unit_price_converted
            if unit_price_value is None:
                unit_price_value = item.unit_price_original

            sr = item.supplier_relation
            StockOperation.objects.create(
                packet=delivery.packet,
                operation_type='buy',
                quantity=float(qty),
                relative_quantity=True,
                unit_price=float(unit_price_value or 0),
                description=f'Purchase {purchase.id} stocking',
                author=actor,
                reference=purchase.id,
                metadata={'supplier_relation_id': str(sr.id)} if sr else {},
            )

            packet = delivery.packet
            if packet and packet.state == PacketState.EXPECTED:
                packet.state = PacketState.STOCKED
                packet.save(update_fields=['state'])
                result.packets.append(packet)

            delivery.is_stocked = True
            delivery.stocked_at = now
            delivery.stocked_by = actor
            delivery.save(update_fields=['is_stocked', 'stocked_at', 'stocked_by'])
            result.stocked_deliveries += 1

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
            result.completed = True

    return result


def unstocked_deliveries(purchase: Purchase):
    return (
        PurchaseDelivery.objects.filter(purchase_item__purchase=purchase, is_stocked=False)
        .select_related('purchase_item__component', 'purchase_item__supplier_relation', 'packet')
        .order_by('id')
    )


# --------------------------------------------------------------------------- #
# Print queue helper
# --------------------------------------------------------------------------- #

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


# --------------------------------------------------------------------------- #
# Supplier CSV export
# --------------------------------------------------------------------------- #

def component_mfpn(component) -> str:
    if not component:
        return ''
    for param in component.parameters.select_related('parameter_type').all():
        if not param.parameter_type or not param.value:
            continue
        name = (param.parameter_type.name or '').strip().lower()
        if name in MFPN_PARAM_NAMES:
            return (param.value or '').strip()
    return ''


PURCHASE_EXPORT_HEADER = ['mouser_part_number', 'MFPN', 'Quantity', 'Customer_reference', 'Internal_id']


def purchase_export_rows(purchase: Purchase) -> list[list]:
    rows = []
    for item in purchase.items.all():
        rows.append([
            (item.symbol or '').strip(),
            component_mfpn(item.component) if item.component_id else '',
            item.quantity,
            (item.description or '').strip(),
            str(item.component_id) if item.component_id else str(item.id),
        ])
    return rows


def purchase_export_csv(purchase: Purchase) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(PURCHASE_EXPORT_HEADER)
    writer.writerows(purchase_export_rows(purchase))
    return buffer.getvalue()
