from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from nextintranet_backend.models import NIModel

from .warehouse import Warehouse


class LocationCheck(NIModel):
    """One finished physical check of a location.

    A snapshot: the packet lists in ``details`` describe what was found at the time and are
    not updated when packets are moved or retired afterwards.
    """

    class Meta:
        verbose_name = _('Location check')
        verbose_name_plural = _('Location checks')
        ordering = ['-created_at']

    location = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='checks')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='location_checks',
    )
    include_children = models.BooleanField(default=True)
    note = models.TextField(blank=True, default='')

    expected_count = models.PositiveIntegerField(default=0)
    confirmed_count = models.PositiveIntegerField(default=0)
    missing_count = models.PositiveIntegerField(default=0)
    unexpected_count = models.PositiveIntegerField(default=0)

    # {"confirmed": [...], "missing": [...], "unexpected": [...]}, each entry
    # {"id", "component", "serial_code", "location"}.
    details = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.location} @ {self.created_at:%Y-%m-%d %H:%M}"
