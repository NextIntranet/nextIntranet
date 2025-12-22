from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from mptt.models import MPTTModel, TreeForeignKey
from colorfield.fields import ColorField
import uuid

from nextintranet_backend.models import NIModel
from nextintranet_backend.models.user import User
from django.urls import reverse
import datetime

class Stocktaking(NIModel):
    class Meta:
        verbose_name = _('Stocktaking')
        verbose_name_plural = _('Stocktakings')

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    open_from = models.DateTimeField(blank=True, null=True)
    open_until = models.DateTimeField(blank=True, null=True)

    authors = models.ManyToManyField(User, related_name='stocktaking_authors')

    def get_absolute_url(self):
        return reverse('stocktaking-process', args=[str(self.id)])
    def __str__(self):
        return self.name