from django.db import models
from django.utils.translation import gettext_lazy as _

from .component import Component, Supplier, Warehouse
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.contrib.auth.models import User



class PurchaseOrder(models.Model):
    STATUS_CHOICES = [
        ("draft", _("Draft")),            # Příprava
        ("ordering", _("In Ordering")),  # Objednávání
        ("ordered", _("Ordered")),       # Objednáno
        ("received", _("Stocked")),      # Naskladněno
        ("completed", _("Completed")),   # Dokončeno
        ("cancelled", _("Cancelled")),   # Zrušeno
    ]

    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, verbose_name=_("Supplier"))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Created At"))
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="draft",
        verbose_name=_("Status"),
    )
    description = models.TextField(blank=True, verbose_name=_("Description"))
    total_original_currency = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, verbose_name=_("Total (Original Currency)")
    )
    total_our_currency = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, verbose_name=_("Total (Our Currency)")
    )
    attachments = models.FileField(upload_to="purchase_orders/", blank=True, null=True, verbose_name=_("Attachments"))

    def save(self, *args, **kwargs):
        # Kontrola, zda se změnil status
        if self.pk:  # Pouze pokud jde o existující objekt
            previous = PurchaseOrder.objects.get(pk=self.pk)
            if previous.status != self.status:  # Změna statusu
                # Vytvoření logu
                PurchaseOrderStatusLog.objects.create(
                    purchase_order=self,
                    status=self.status,
                    changed_by=getattr(self, '_current_user', None),  # Nastavený uživatel
                )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Order #{self.id} - {self.supplier.name}"


class PurchaseOrderStatusLog(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="status_logs")
    status = models.CharField(max_length=20, choices=PurchaseOrder.STATUS_CHOICES, verbose_name=_("Status"))
    changed_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Changed At"))
    changed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name=_("Changed By"))

    def __str__(self):
        return f"Status {self.status} for Order #{self.purchase_order.id}"


class PurchaseOrderItem(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items", verbose_name=_("Purchase Order"))
    component = models.ForeignKey(Component, on_delete=models.CASCADE, verbose_name=_("Component"), null=True, blank=True)
    name = models.CharField(max_length=255, verbose_name=_("Item Name"))  # Pro manuálně přidané položky
    is_manual = models.BooleanField(default=False, verbose_name=_("Manually Added"))  # Flag pro manuální položky
    description = models.TextField(blank=True, verbose_name=_("Description"))
    quantity = models.PositiveIntegerField(verbose_name=_("Quantity"))
    unit_price_original_currency = models.DecimalField(
        max_digits=10, decimal_places=2, verbose_name=_("Unit Price (Original Currency)")
    )
    unit_price_our_currency = models.DecimalField(
        max_digits=10, decimal_places=2, verbose_name=_("Unit Price (Our Currency)")
    )
    is_finalized = models.BooleanField(default=False, verbose_name=_("Finalized"))
    finalized_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Finalized At"))

    def finalize_item(self):
        if not self.is_finalized:
            self.is_finalized = True
            self.finalized_at = timezone.now()
            self.save()

    def __str__(self):
        return f"{self.name} x {self.quantity}"
