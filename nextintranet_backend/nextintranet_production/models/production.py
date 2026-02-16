from django.db import models
from django.utils.translation import gettext_lazy as _
from django.urls import reverse
from django.conf import settings
import os
import uuid
from datetime import date

from nextintranet_backend.models import NIModel
from nextintranet_warehouse.models.component import Component


def _manufacturing_upload_path(prefix: str, filename: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower() or ".bin"
    today = date.today()
    return f"uploads/manufacturing/{prefix}/{today:%Y/%m}/{uuid.uuid4()}{ext}"


def bom_source_upload_path(instance, filename: str) -> str:
    return _manufacturing_upload_path("source", filename)


def bom_ibom_upload_path(instance, filename: str) -> str:
    return _manufacturing_upload_path("ibom", filename)


class Production(NIModel):
    """
    Výrobní projekt (produkt/typ výroby).
    Každá production obsahuje několik šablon a realizací.
    """
    name = models.CharField(
        max_length=255,
        verbose_name=_('Name'),
        help_text=_('Název výrobního projektu')
    )
    
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('Description'),
        help_text=_('Popis výrobního projektu')
    )
    
    folder = models.ForeignKey(
        'ProductionFolder',
        on_delete=models.CASCADE,
        related_name='productions',
        verbose_name=_('Folder'),
        help_text=_('Složka, ve které je production uložena')
    )
    
    link = models.URLField(
        blank=True,
        null=True,
        verbose_name=_('Link'),
        help_text=_('HTTP odkaz související s výrobním projektem (např. dokumentace, specifikace)')
    )
    
    component_reference = models.ForeignKey(
        Component,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='productions',
        verbose_name=_('Component Reference'),
        help_text=_('Odkaz na skladovou položku (pokud production odpovídá konkrétní součástce)')
    )

    class Meta:
        verbose_name = _('Production')
        verbose_name_plural = _('Productions')
        ordering = ['name']

    def __str__(self):
        return self.name
    
    def get_absolute_url(self):
        return reverse('production-detail', args=[str(self.id)])


class Template(NIModel):
    """
    Šablona (předloha) pro výrobu.
    Obsahuje správné složení - správný seznam součástek.
    Každá šablona patří k jedné production.
    """
    production = models.ForeignKey(
        Production,
        on_delete=models.CASCADE,
        related_name='templates',
        verbose_name=_('Production'),
        help_text=_('Výrobní projekt, ke kterému šablona patří')
    )
    
    name = models.CharField(
        max_length=255,
        verbose_name=_('Name'),
        help_text=_('Název šablony')
    )
    
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('Description'),
        help_text=_('Popis šablony')
    )
    
    version = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        verbose_name=_('Version'),
        help_text=_('Verze šablony (např. v1.0, v2.1)')
    )

    STATUS_CHOICES = [
        ('draft', _('Draft')),
        ('in_progress', _('In progress')),
        ('locked', _('Locked')),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name=_('Status'),
        help_text=_('Lifecycle status of this BOM.'),
    )
    qty_planned = models.PositiveIntegerField(
        default=1,
        verbose_name=_('Planned quantity'),
        help_text=_('How many boards are planned for this BOM.'),
    )
    planned_date = models.DateField(
        blank=True,
        null=True,
        verbose_name=_('Planned date'),
    )
    source_url = models.URLField(
        blank=True,
        null=True,
        verbose_name=_('Source URL'),
        help_text=_('Optional URL used for BOM re-import.'),
    )
    source_hash = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        verbose_name=_('Source hash'),
    )
    source_file = models.FileField(
        upload_to=bom_source_upload_path,
        blank=True,
        null=True,
        verbose_name=_('Source file'),
    )
    source_imported_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name=_('Source imported at'),
    )
    ibom_url = models.URLField(
        blank=True,
        null=True,
        verbose_name=_('iBOM URL'),
    )
    ibom_file = models.FileField(
        upload_to=bom_ibom_upload_path,
        blank=True,
        null=True,
        verbose_name=_('iBOM file'),
    )
    ibom_updated_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name=_('iBOM updated at'),
    )
    production_checkpoint = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Production checkpoint'),
        help_text=_('Aggregated scanner checkpoint JSON used to restore UI state.'),
    )
    locked_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name=_('Locked at'),
    )
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='locked_boms',
        verbose_name=_('Locked by'),
    )

    class Meta:
        verbose_name = _('Template')
        verbose_name_plural = _('Templates')
        ordering = ['production', 'name']

    def __str__(self):
        return f"{self.production.name} - {self.name}"
    
    def get_absolute_url(self):
        return reverse('template-detail', args=[str(self.id)])


class TemplateComponent(NIModel):
    """
    Součástka v šabloně.
    Každá instance reprezentuje jednu konkrétní součástku (ne množství).
    """
    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name='components',
        verbose_name=_('Template'),
        help_text=_('Šablona, ke které součástka patří')
    )
    
    component = models.ForeignKey(
        Component,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='template_usages',
        verbose_name=_('Component'),
        help_text=_('Součástka ze skladu (pokud byla nalezena)')
    )
    
    position = models.PositiveIntegerField(
        default=0,
        verbose_name=_('Position'),
        help_text=_('Pozice v seznamu (pro řazení)')
    )
    
    notes = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('Notes'),
        help_text=_('Poznámky k součástce v šabloně')
    )
    
    attributes = models.JSONField(
        blank=True,
        null=True,
        default=dict,
        verbose_name=_('Attributes'),
        help_text=_('Další atributy součástky (JSON)')
    )
    source_type = models.CharField(
        max_length=20,
        choices=[('imported', _('Imported')), ('manual', _('Manual'))],
        default='imported',
        verbose_name=_('Source type'),
    )
    ref_group = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('Ref group'),
        help_text=_('Comma-separated designators from source netlist.'),
    )
    refs = models.JSONField(
        blank=True,
        default=list,
        verbose_name=_('Refs'),
        help_text=_('List of designators in this BOM row.'),
    )
    qty_per_board = models.PositiveIntegerField(
        default=1,
        verbose_name=_('Qty per board'),
    )
    qty_override_total = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        blank=True,
        null=True,
        verbose_name=_('Qty override total'),
    )
    value = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name=_('Value'),
    )
    footprint = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name=_('Footprint'),
    )
    datasheet = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('Datasheet'),
    )
    bom_description = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('BOM description'),
    )
    dnp = models.BooleanField(
        default=False,
        verbose_name=_('Do not populate'),
    )
    needs_review = models.BooleanField(
        default=False,
        verbose_name=_('Needs review'),
    )
    import_snapshot = models.JSONField(
        blank=True,
        null=True,
        default=dict,
        verbose_name=_('Import snapshot'),
    )
    sourced_total = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        default=0,
        verbose_name=_('Sourced total'),
    )
    placed_total = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        default=0,
        verbose_name=_('Placed total'),
    )

    class Meta:
        verbose_name = _('Template Component')
        verbose_name_plural = _('Template Components')
        ordering = ['template', 'position']

    def __str__(self):
        component_name = self.component.name if self.component else 'Unknown'
        return f"{self.template.name} - {component_name}"


class Realization(NIModel):
    """
    Realizace výroby.
    Vychází z konkrétní šablony, ale může být upravena.
    Při vytvoření se zkopíruje ze šablony a pak lze editovat.
    """
    
    STATUS_CHOICES = [
        ('draft', _('Draft')),
        ('in_progress', _('In Progress')),
        ('completed', _('Completed')),
        ('cancelled', _('Cancelled')),
    ]
    
    production = models.ForeignKey(
        Production,
        on_delete=models.CASCADE,
        related_name='realizations',
        verbose_name=_('Production'),
        help_text=_('Výrobní projekt, ke kterému realizace patří')
    )
    
    template = models.ForeignKey(
        Template,
        on_delete=models.PROTECT,
        related_name='realizations',
        verbose_name=_('Template'),
        help_text=_('Šablona, ze které realizace vychází')
    )
    
    name = models.CharField(
        max_length=255,
        verbose_name=_('Name'),
        help_text=_('Název realizace')
    )
    
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('Description'),
        help_text=_('Popis realizace')
    )
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name=_('Status'),
        help_text=_('Stav realizace')
    )
    
    started_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name=_('Started at'),
        help_text=_('Čas zahájení výroby')
    )
    
    completed_at = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name=_('Completed at'),
        help_text=_('Čas dokončení výroby')
    )

    class Meta:
        verbose_name = _('Realization')
        verbose_name_plural = _('Realizations')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.production.name} - {self.name}"
    
    def get_absolute_url(self):
        return reverse('realization-detail', args=[str(self.id)])


class RealizationComponent(NIModel):
    """
    Součástka v realizaci.
    Každá instance reprezentuje jednu konkrétní součástku.
    Zkopírována ze šablony, ale může být upravena.
    """
    realization = models.ForeignKey(
        Realization,
        on_delete=models.CASCADE,
        related_name='components',
        verbose_name=_('Realization'),
        help_text=_('Realizace, ke které součástka patří')
    )
    
    template_component = models.ForeignKey(
        TemplateComponent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='realization_components',
        verbose_name=_('Template Component'),
        help_text=_('Původní součástka ze šablony (pokud existuje)')
    )
    
    component = models.ForeignKey(
        Component,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='realization_usages',
        verbose_name=_('Component'),
        help_text=_('Součástka ze skladu (pokud byla nalezena)')
    )
    
    position = models.PositiveIntegerField(
        default=0,
        verbose_name=_('Position'),
        help_text=_('Pozice v seznamu (pro řazení)')
    )
    
    notes = models.TextField(
        blank=True,
        null=True,
        verbose_name=_('Notes'),
        help_text=_('Poznámky k součástce v realizaci')
    )
    
    attributes = models.JSONField(
        blank=True,
        null=True,
        default=dict,
        verbose_name=_('Attributes'),
        help_text=_('Další atributy součástky (JSON)')
    )
    
    is_modified = models.BooleanField(
        default=False,
        verbose_name=_('Is modified'),
        help_text=_('Označuje, zda byla součástka upravena oproti šabloně')
    )

    class Meta:
        verbose_name = _('Realization Component')
        verbose_name_plural =_('Realization Components')
        ordering = ['realization', 'position']

    def __str__(self):
        component_name = self.component.name if self.component else 'Unknown'
        return f"{self.realization.name} - {component_name}"


class TemplateComponentScan(NIModel):
    MODE_CHOICES = [
        ('sourced', _('Sourced')),
        ('placed', _('Placed')),
    ]

    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name='scans',
        verbose_name=_('Template'),
    )
    template_component = models.ForeignKey(
        TemplateComponent,
        on_delete=models.CASCADE,
        related_name='scans',
        verbose_name=_('Template component'),
    )
    mode = models.CharField(
        max_length=20,
        choices=MODE_CHOICES,
        verbose_name=_('Mode'),
    )
    barcode = models.TextField(
        verbose_name=_('Barcode'),
    )
    resolved_component = models.ForeignKey(
        Component,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='manufacturing_scans',
        verbose_name=_('Resolved component'),
    )
    resolved_packet_id = models.UUIDField(
        blank=True,
        null=True,
        verbose_name=_('Resolved packet id'),
    )
    qty = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        default=1,
        verbose_name=_('Quantity'),
    )

    class Meta:
        verbose_name = _('Template component scan')
        verbose_name_plural = _('Template component scans')
        ordering = ['-created_at']
