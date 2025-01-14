from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from mptt.models import MPTTModel, TreeForeignKey
from colorfield.fields import ColorField
import uuid

from nextintranet_backend.models import NIModel

class Category(MPTTModel, NIModel):
    
    # Kategorie součástek
    name = models.CharField(max_length=100, unique=True, verbose_name=_('Name'))
    abbreviation = models.SlugField(max_length=50, unique=True, verbose_name=_('Abbreviation'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Description'))
    parent = TreeForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='sub_categories', verbose_name=_('Parent category'))  # Hierarchický vztah
    color = ColorField(default=None, blank=True, null=True, verbose_name=_('Color'))
    icon = models.CharField(max_length=255, blank=True, null=True, verbose_name=_('Icon'))


    class MPTTMeta:
        order_insertion_by = ['name']
    
    class Meta:
        verbose_name = _('Category')
        verbose_name_plural = _('Categories')



    @property
    def effective_color(self):
        if self.color:
            return self.color
        if self.parent:
            return self.parent.effective_color
        return None

    @property
    def effective_icon(self):
        if self.icon:
            return self.icon
        if self.parent:
            return self.parent.effective_icon
        return None
    
    @property
    def full_path(self):
        return '/'.join([category.name for category in self.get_ancestors(include_self=True)])
    
    def __str__(self):
        return f"{self.full_path}"

