import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from nextintranet_backend.models import NIModel

from .component import Component, Packet, Supplier, SupplierRelation
from .warehouse import Warehouse

class PurchaseStatus(models.TextChoices):
    DRAFT = 'draft', _('Draft')
    ITEMS_DEFINED = 'items_defined', _('Items defined')
    PRICED = 'priced', _('Priced')
    CLOSED = 'closed', _('Closed')
    EXPORTED = 'exported', _('Exported')
    RECEIVING = 'receiving', _('Receiving')
    STOCKING = 'stocking', _('Stocking')
    COMPLETED = 'completed', _('Completed')


class PurchaseExportMode(models.TextChoices):
    LIST = 'list', _('Generic list')
    SUPPLIER_CSV = 'supplier_csv', _('Supplier CSV')


class Purchase(NIModel):
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name=_("Created by"),
        related_name="purchases"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Created at"))
    delivery_date = models.DateField(null=True, blank=True, verbose_name=_("Delivery date"))
    stocked_date = models.DateField(null=True, blank=True, verbose_name=_("Stocked date"))
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Closed at"))
    exported_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Exported at"))
    receiving_started_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Receiving started at"))
    stocking_started_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Stocking started at"))
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Completed at"))
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        verbose_name=_("Supplier")
    )

    status = models.CharField(
        max_length=20,
        choices=PurchaseStatus.choices,
        default=PurchaseStatus.DRAFT,
        verbose_name=_("Status")
    )

    currency = models.CharField(
        null=True,
        blank=True,
        max_length=10,
        verbose_name=_("Currency")
    )

    total_price_original = models.DecimalField(
        null=True,
        blank=True,
        max_digits=12,
        decimal_places=2,
        verbose_name=_("Total price (original currency) without VAT")
    )

    total_price_original_vat = models.DecimalField(
        null=True,
        blank=True,
        max_digits=12,
        decimal_places=2,
        verbose_name=_("Total price (original currency) with VAT")
    )

    total_price_converted = models.DecimalField(
        null=True,
        blank=True,
        max_digits=12,
        decimal_places=2,
        verbose_name=_("Total price (converted to our currency)")
    )
    export_mode = models.CharField(
        max_length=20,
        choices=PurchaseExportMode.choices,
        default=PurchaseExportMode.LIST,
        verbose_name=_("Export mode"),
    )
    export_file = models.FileField(
        upload_to='purchase_exports/',
        blank=True,
        null=True,
        verbose_name=_("Export file"),
    )

    note = models.TextField(blank=True, verbose_name=_("Note"))

    STATUS_TRANSITIONS = {
        PurchaseStatus.DRAFT: {PurchaseStatus.ITEMS_DEFINED},
        PurchaseStatus.ITEMS_DEFINED: {PurchaseStatus.PRICED},
        PurchaseStatus.PRICED: {PurchaseStatus.CLOSED},
        PurchaseStatus.CLOSED: {PurchaseStatus.EXPORTED},
        PurchaseStatus.EXPORTED: {PurchaseStatus.RECEIVING},
        PurchaseStatus.RECEIVING: {PurchaseStatus.STOCKING, PurchaseStatus.COMPLETED},
        PurchaseStatus.STOCKING: {PurchaseStatus.COMPLETED},
        PurchaseStatus.COMPLETED: set(),
    }

    class Meta:
        verbose_name = _("Purchase")
        verbose_name_plural = _("Purchases")
        ordering = ['-created_at']

    def __str__(self):
        return f"Purchase #{self.id} - {self.supplier} ({self.get_status_display()})"

    def can_transition_to(self, target_status: str) -> bool:
        if self.status == target_status:
            return True
        return target_status in self.STATUS_TRANSITIONS.get(self.status, set())

    def validate_transition_to(self, target_status: str):
        if self.status == target_status:
            return

        if not self.can_transition_to(target_status):
            raise ValidationError(
                {'status': f'Invalid transition from "{self.status}" to "{target_status}".'}
            )

        items = self.items.all()
        stock_items = items.filter(item_type=PurchaseItemType.COMPONENT)

        if target_status == PurchaseStatus.ITEMS_DEFINED and not items.exists():
            raise ValidationError({'status': 'At least one item is required before moving to items defined.'})

        if target_status in {
            PurchaseStatus.PRICED,
            PurchaseStatus.CLOSED,
            PurchaseStatus.EXPORTED,
            PurchaseStatus.RECEIVING,
            PurchaseStatus.STOCKING,
            PurchaseStatus.COMPLETED,
        }:
            if not items.exists():
                raise ValidationError({'status': 'At least one item is required.'})
            if items.filter(quantity__lte=0).exists():
                raise ValidationError({'status': 'All items must have quantity greater than zero.'})

        if target_status == PurchaseStatus.COMPLETED:
            if stock_items.filter(delivered_quantity__lt=models.F('quantity')).exists():
                raise ValidationError({'status': 'All stock items must be fully received before completion.'})
            if stock_items.filter(stocked_quantity__lt=models.F('delivered_quantity')).exists():
                raise ValidationError({'status': 'All received stock items must be stocked before completion.'})
            missing_location = stock_items.filter(
                stocked_quantity__gt=0,
                stock_location__isnull=True,
            ).exists()
            if missing_location:
                raise ValidationError({'status': 'Stock location is required for stocked items.'})

    def transition_to(self, target_status: str, *, save: bool = True):
        self.validate_transition_to(target_status)
        if self.status == target_status:
            return

        self.status = target_status
        now = timezone.now()
        update_fields = ['status']

        if target_status == PurchaseStatus.CLOSED and self.closed_at is None:
            self.closed_at = now
            update_fields.append('closed_at')
        if target_status == PurchaseStatus.EXPORTED and self.exported_at is None:
            self.exported_at = now
            update_fields.append('exported_at')
        if target_status == PurchaseStatus.RECEIVING and self.receiving_started_at is None:
            self.receiving_started_at = now
            update_fields.append('receiving_started_at')
        if target_status == PurchaseStatus.STOCKING and self.stocking_started_at is None:
            self.stocking_started_at = now
            update_fields.append('stocking_started_at')
        if target_status == PurchaseStatus.COMPLETED:
            if self.completed_at is None:
                self.completed_at = now
                update_fields.append('completed_at')
            if self.stocked_date is None:
                self.stocked_date = now.date()
                update_fields.append('stocked_date')

        if save:
            self.save(update_fields=update_fields)


class PurchaseItemType(models.TextChoices):
    COMPONENT = 'component', _('Component')
    NON_STOCK = 'non_stock', _('Non-stock')


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(
        'Purchase',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_("Purchase")
    )

    item_type = models.CharField(
        max_length=20,
        choices=PurchaseItemType.choices,
        default=PurchaseItemType.COMPONENT,
        verbose_name=_("Item type"),
    )

    component = models.ForeignKey(
        Component,
        on_delete=models.PROTECT,
        verbose_name=_("Component"),
        related_name='orders',
        null=True,
        blank=True,
    )

    supplier_relation = models.ForeignKey(
        SupplierRelation,
        on_delete=models.PROTECT,
        verbose_name=_("Supplier item"),
        related_name='orders',
        null=True,
        blank=True,
    )

    symbol = models.CharField(max_length=100, verbose_name=_("Symbol"), null=True, blank=True)
    name = models.CharField(max_length=255, verbose_name=_("Item name"), blank=True)
    description = models.TextField(blank=True, verbose_name=_("Description"))
    requested_quantity = models.PositiveIntegerField(default=0, verbose_name=_("Requested quantity"))
    quantity = models.PositiveIntegerField(verbose_name=_("Quantity"))
    package_size = models.PositiveIntegerField(default=1, verbose_name=_("Package size"))

    unit_price_original = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name=_("Unit price (original currency)"),
        null=True,
        blank=True,
    )

    unit_price_converted = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name=_("Unit price (converted currency)"),
        null=True,
        blank=True,
    )

    delivered_quantity = models.PositiveIntegerField(default=0, verbose_name=_("Delivered quantity"))
    stocked_quantity = models.PositiveIntegerField(default=0, verbose_name=_("Stocked quantity"))
    is_fully_delivered = models.BooleanField(default=False, verbose_name=_("Fully delivered"))
    stock_location = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='purchase_items',
        limit_choices_to={'can_store_items': True},
        verbose_name=_("Stock location"),
    )

    class Meta:
        verbose_name = _("Purchase Item")
        verbose_name_plural = _("Purchase Items")

    def __str__(self):
        if self.item_type == PurchaseItemType.NON_STOCK:
            return f"{self.name or self.symbol or 'Non-stock item'} in {self.purchase}"
        return f"{self.component} ({self.symbol}) in {self.purchase}"

    def clean(self):
        errors = {}

        if self.item_type == PurchaseItemType.COMPONENT:
            if self.component is None and self.supplier_relation is None:
                errors['component'] = _('Component item must define component or supplier relation.')
            if self.supplier_relation and self.purchase_id and self.purchase.supplier_id != self.supplier_relation.supplier_id:
                errors['supplier_relation'] = _('Supplier relation must match purchase supplier.')
            if self.supplier_relation and self.component and self.supplier_relation.component_id != self.component_id:
                errors['supplier_relation'] = _('Supplier relation must match selected component.')
            if self.name:
                errors['name'] = _('Component item does not use item name.')
        else:
            if not self.name:
                errors['name'] = _('Non-stock item requires item name.')
            if self.component is not None:
                errors['component'] = _('Non-stock item cannot have component.')
            if self.supplier_relation is not None:
                errors['supplier_relation'] = _('Non-stock item cannot have supplier relation.')
            if self.stock_location_id is not None:
                errors['stock_location'] = _('Non-stock item cannot have stock location.')

        if self.delivered_quantity > self.quantity:
            errors['delivered_quantity'] = _('Delivered quantity cannot exceed ordered quantity.')
        if self.stocked_quantity > self.delivered_quantity:
            errors['stocked_quantity'] = _('Stocked quantity cannot exceed delivered quantity.')

        if errors:
            raise ValidationError(errors)

    @property
    def is_stock_item(self) -> bool:
        return self.item_type == PurchaseItemType.COMPONENT



class PurchaseDelivery(models.Model):
    purchase_item = models.ForeignKey(
        PurchaseItem,
        on_delete=models.CASCADE,
        related_name='deliveries',
        verbose_name=("Purchase Item")
    )
    delivery_date = models.DateField(verbose_name=("Delivery date"))
    delivered_quantity = models.PositiveIntegerField(verbose_name=("Delivered quantity"))
    note = models.TextField(blank=True, verbose_name=("Note"))
    stock_location = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='purchase_deliveries',
        limit_choices_to={'can_store_items': True},
        verbose_name=("Stock location"),
    )
    packet = models.ForeignKey(
        Packet,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_deliveries',
        verbose_name=("Packet"),
    )
    is_stocked = models.BooleanField(default=False, verbose_name=("Stocked"))
    stocked_at = models.DateTimeField(null=True, blank=True, verbose_name=("Stocked at"))
    stocked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stocked_purchase_deliveries',
        verbose_name=("Stocked by"),
    )
    labels_queued_at = models.DateTimeField(null=True, blank=True, verbose_name=("Labels queued at"))
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_deliveries',
        verbose_name=("Received by"),
    )

    class Meta:
        verbose_name = ("Delivery")
        verbose_name_plural = ("Deliveries")

    def __str__(self):
        return f"Delivery for {self.purchase_item} on {self.delivery_date}"


class PurchaseRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    quantity = models.PositiveIntegerField(default=1, verbose_name=("Quantity"))
    description = models.TextField(blank=True, verbose_name=("Description"))
    item_name = models.CharField(max_length=255, blank=True, null=True, verbose_name=("Item name"))

    component = models.ForeignKey(
        Component,
        on_delete=models.PROTECT,
        related_name='purchase_requests',
        verbose_name=("Component"),
        null=True,
        blank=True,
    )

    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='requests',
        verbose_name=("Purchase"),
    )

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='purchase_requests',
        verbose_name=("Requested by"),
    )

    class Meta:
        verbose_name = ("Purchase request")
        verbose_name_plural = ("Purchase requests")
        ordering = ['-created_at']

    def __str__(self):
        item = self.component.name if self.component else (self.item_name or "Unknown item")
        return f"Purchase request for {item} (qty {self.quantity})"
