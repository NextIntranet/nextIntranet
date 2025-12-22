from django.db import models
from django.utils.translation import gettext_lazy as _
from django.urls import reverse

from nextintranet_backend.models import NIModel
from nextintranet_warehouse.models.component import Component


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
