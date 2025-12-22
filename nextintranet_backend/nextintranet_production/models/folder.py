from django.db import models
from django.utils.translation import gettext_lazy as _
from mptt.models import MPTTModel, TreeForeignKey

from nextintranet_backend.models import NIModel


class ProductionFolder(MPTTModel, NIModel):
    """
    Hierarchická struktura složek pro organizaci productions (výrobních projektů).
    Používá MPTT pro efektivní práci s hierarchií.
    """
    name = models.CharField(
        max_length=255,
        verbose_name=_('Name'),
        help_text=_('Název složky')
    )
    
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('Description'),
        help_text=_('Popis složky')
    )
    
    parent = TreeForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name=_('Parent folder'),
        help_text=_('Nadřazená složka')
    )

    class MPTTMeta:
        order_insertion_by = ['name']
    
    class Meta:
        verbose_name = _('Production Folder')
        verbose_name_plural = _('Production Folders')
        ordering = ['name']

    def __str__(self):
        return self.full_path
    
    @property
    def full_path(self):
        """Vrátí celou cestu složky od kořene"""
        return '/'.join([folder.name for folder in self.get_ancestors(include_self=True)])
