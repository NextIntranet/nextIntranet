from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from mptt.models import MPTTModel, TreeForeignKey
from colorfield.fields import ColorField
import uuid

from nextintranet_backend.models import NIModel

class Warehouse(MPTTModel, NIModel):
    # Sklad nebo místo, kde se součástky uchovávají
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    name = models.CharField(max_length=255, verbose_name=_('Name'))
    location = models.CharField(max_length=255, blank=True, null=True, verbose_name=_('Location'))  # Lokace skladu (může být adresa nebo jiné označení)
    parent = TreeForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='sub_units', verbose_name=_('Parent unit'))  # Hierarchický vztah
    can_store_items = models.BooleanField(default=False, help_text=_('Indicates if this location can store components.'), verbose_name=_('Can store items'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Description'))  # Popis skladu nebo umístění

    class MPTTMeta:
        order_insertion_by = ['name']

    
    @property
    def full_path(self):
        path = self.get_ancestors(include_self=True)
        path_names = [node.name for node in path]
        return "/".join(path_names)

    def __str__(self):
        return f"{self.full_path}"
