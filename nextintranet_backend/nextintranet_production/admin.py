from django.contrib import admin
from mptt.admin import MPTTModelAdmin

from .models import (
    ProductionFolder,
    Production,
    Template,
    TemplateComponent,
    Realization,
    RealizationComponent,
    TemplateComponentScan,
)


@admin.register(ProductionFolder)
class ProductionFolderAdmin(MPTTModelAdmin):
    list_display = ['name', 'parent', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name', 'description']
    mptt_level_indent = 20


class TemplateComponentInline(admin.TabularInline):
    model = TemplateComponent
    extra = 1
    fields = ['component', 'position', 'value', 'footprint', 'qty_per_board', 'dnp', 'notes', 'attributes']
    autocomplete_fields = ['component']


@admin.register(Production)
class ProductionAdmin(admin.ModelAdmin):
    list_display = ['name', 'folder', 'component_reference', 'created_at']
    list_filter = ['folder', 'created_at']
    search_fields = ['name', 'description']
    autocomplete_fields = ['folder', 'component_reference']
    
    fieldsets = (
        ('Základní informace', {
            'fields': ('name', 'description', 'folder')
        }),
        ('Reference', {
            'fields': ('link', 'component_reference')
        }),
    )


@admin.register(Template)
class TemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'production', 'status', 'qty_planned', 'planned_date', 'version', 'created_at']
    list_filter = ['production', 'status', 'created_at']
    search_fields = ['name', 'description', 'production__name']
    autocomplete_fields = ['production']
    inlines = [TemplateComponentInline]


@admin.register(TemplateComponent)
class TemplateComponentAdmin(admin.ModelAdmin):
    list_display = ['template', 'component', 'value', 'footprint', 'qty_per_board', 'dnp', 'position']
    list_filter = ['template', 'dnp', 'source_type']
    search_fields = ['template__name', 'component__name', 'value', 'footprint', 'ref_group']
    autocomplete_fields = ['template', 'component']


class RealizationComponentInline(admin.TabularInline):
    model = RealizationComponent
    extra = 0
    fields = ['component', 'position', 'notes', 'attributes', 'is_modified']
    autocomplete_fields = ['component']
    readonly_fields = ['template_component']


@admin.register(Realization)
class RealizationAdmin(admin.ModelAdmin):
    list_display = ['name', 'production', 'template', 'status', 'started_at', 'completed_at']
    list_filter = ['status', 'production', 'started_at', 'completed_at']
    search_fields = ['name', 'description', 'production__name']
    autocomplete_fields = ['production', 'template']
    inlines = [RealizationComponentInline]
    
    fieldsets = (
        ('Základní informace', {
            'fields': ('production', 'template', 'name', 'description')
        }),
        ('Stav', {
            'fields': ('status', 'started_at', 'completed_at')
        }),
    )


@admin.register(RealizationComponent)
class RealizationComponentAdmin(admin.ModelAdmin):
    list_display = ['realization', 'component', 'is_modified', 'position']
    list_filter = ['realization', 'is_modified']
    search_fields = ['realization__name', 'component__name']
    autocomplete_fields = ['realization', 'component', 'template_component']


@admin.register(TemplateComponentScan)
class TemplateComponentScanAdmin(admin.ModelAdmin):
    list_display = ['template', 'template_component', 'mode', 'barcode', 'resolved_component', 'created_at']
    list_filter = ['mode', 'template', 'created_at']
    search_fields = ['template__name', 'template_component__value', 'barcode', 'resolved_component__name']
    autocomplete_fields = ['template', 'template_component', 'resolved_component']
