from django.contrib import admin

from .models import warehouse
from .models import component
from .models import category
from .models import purchase


class SuppliersRelationInline(admin.TabularInline):
    model = component.SupplierRelation
    extra = 1

class StockOperationInline(admin.TabularInline):
    model = component.StockOperation
    extra = 1

class PacketInline(admin.TabularInline):
    model = component.Packet
    extra = 1


admin.site.register(warehouse.Warehouse)
class ComponentAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'category')
    search_fields = ('name', 'description')
    list_filter = ('category',)
    inlines = (SuppliersRelationInline, PacketInline)
    # filter_horizontal = ('suppliers', 'tags', 'reservations', 'parameters')

admin.site.register(component.Component, ComponentAdmin)
admin.site.register(component.Packet)
admin.site.register(component.PriceHistory)
admin.site.register(component.Identifier)
admin.site.register(component.Supplier)
admin.site.register(component.SupplierRelation)
admin.site.register(category.Category)
admin.site.register(component.Tag)
admin.site.register(component.Document)
admin.site.register(component.StockOperation)
admin.site.register(component.Reservation)
admin.site.register(component.ParameterType)
admin.site.register(component.ComponentParameter)


admin.site.register(purchase.Purchase)
admin.site.register(purchase.PurchaseItem)
admin.site.register(purchase.PurchaseDelivery)
