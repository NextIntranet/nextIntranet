import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from .component import Component
from .warehouse import Warehouse


class TransferStatus(models.TextChoices):
    OPEN = 'open', _('Open')
    DONE = 'done', _('Done')
    CANCELLED = 'cancelled', _('Cancelled')


class TransferRequest(models.Model):
    """A request to move stock of a component from one warehouse to another.

    While open it holds the quantity in the source warehouse (so nobody else takes it) and is
    shown as incoming in the target warehouse. The physical move is done with the usual packet
    tools; the request is then marked done.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    component = models.ForeignKey(
        Component, on_delete=models.CASCADE, related_name='transfer_requests', verbose_name=_('Component')
    )
    quantity = models.FloatField(verbose_name=_('Quantity'))
    source_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='outgoing_transfers',
        limit_choices_to={'is_warehouse': True},
        verbose_name=_('From warehouse'),
    )
    target_location = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='incoming_transfers',
        verbose_name=_('To location'),
        help_text=_('Warehouse or storage position the parts should be moved to.'),
    )
    status = models.CharField(
        max_length=16, choices=TransferStatus.choices, default=TransferStatus.OPEN, db_index=True,
        verbose_name=_('Status'),
    )
    note = models.TextField(blank=True, verbose_name=_('Note'))
    source = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Source'),
        help_text=_('Where the request came from, e.g. {"type": "production", "bom_id": "...", "line_id": "..."}.'),
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfer_requests',
        verbose_name=_('Requested by'),
    )
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Completed at'))
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='completed_transfers',
        verbose_name=_('Completed by'),
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Transfer request')
        verbose_name_plural = _('Transfer requests')

    def __str__(self):
        return f"Transfer {self.quantity:g} × {self.component.name}: {self.source_warehouse} → {self.target_location}"
