from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from mptt.models import MPTTModel, TreeForeignKey
from colorfield.fields import ColorField
import uuid

from .component import Component, SupplierRelation, Supplier

from django.db import models
from django.utils.translation import gettext_lazy as _

from nextintranet_backend.models import NIModel


from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _

class PurchaseStatus(models.TextChoices):
    DRAFT = 'draft', _('Draft')
    SUBMITTED = 'submitted', _('Submitted')
    APPROVED = 'approved', _('Approved')
    REJECTED = 'rejected', _('Rejected')
    COMPLETED = 'completed', _('Completed')

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

    note = models.TextField(blank=True, verbose_name=_("Note"))

    class Meta:
        verbose_name = _("Purchase")
        verbose_name_plural = _("Purchases")
        ordering = ['-created_at']

    def __str__(self):
        return f"Purchase #{self.id} - {self.supplier} ({self.get_status_display()})"


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(
        'Purchase',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_("Purchase")
    )

    component = models.ForeignKey(
        Component,
        on_delete=models.PROTECT,
        verbose_name=_("Component"),
        related_name='orders'
    )
    
    #TODO: zkontrolovat, že supplier_relation vychází z komponenty
    supplier_relation = models.ForeignKey(
        SupplierRelation,
        on_delete=models.PROTECT,
        verbose_name=_("Supplier item"),
        related_name='orders'
    )

    symbol = models.CharField(max_length=100, verbose_name=_("Symbol"))
    
    unit_price_original = models.DecimalField(
        max_digits=12, decimal_places=2, verbose_name=_("Unit price (original currency)")
    )
    
    unit_price_converted = models.DecimalField(
        max_digits=12, decimal_places=2, verbose_name=_("Unit price (converted currency)")
    )
    quantity = models.PositiveIntegerField(verbose_name=_("Quantity"))
    package_size = models.PositiveIntegerField(verbose_name=_("Package size"))
    is_fully_delivered = models.BooleanField(default=False, verbose_name=_("Fully delivered"))
    delivered_quantity = models.PositiveIntegerField(default=0, verbose_name=_("Delivered quantity"))

    class Meta:
        verbose_name = _("Purchase Item")
        verbose_name_plural = _("Purchase Items")

    def __str__(self):
        return f"{self.component} ({self.symbol}) in {self.purchase}"



class PurchaseDelivery(models.Model):
    purchase_item = models.ForeignKey(
        PurchaseItem,
        on_delete=models.CASCADE,
        related_name='deliveries',
        verbose_name=("Purchase Item")
    )
    delivery_date = models.DateField(verbose_name=("Delivery date"))
    delivered_quantity = models.PositiveIntegerField(verbose_name=("Delivered quantity"))

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

    component = models.ForeignKey(
        Component,
        on_delete=models.PROTECT,
        related_name='purchase_requests',
        verbose_name=("Component"),
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
        return f"Purchase request for {self.component} (qty {self.quantity})"
