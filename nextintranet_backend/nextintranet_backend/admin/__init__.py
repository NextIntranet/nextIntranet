from django.contrib import admin
# from ..models import Component, Identifier, ParameterType, ComponentParameter, Document, Supplier, SupplierRelation, Tag, Category, Batch, StockOperation, Reservation, PriceHistory

#from nextintranet_backend.models.component import Component
#from nextintranet_backend.models.identifier import Identifier

from ..models.user import User
from ..models.userSettings import UserSetting

# class ComponentAdmin(admin.ModelAdmin):
#     list_display = ('name', 'uuid', 'category', 'unit_type', 'selling_price', 'internal_price')
#     search_fields = ('name', 'uuid', 'category__name')
#     list_filter = ('category', 'unit_type')


# class IdentifierAdmin(admin.ModelAdmin):
#     list_display = ('identifier', 'content_type', 'object_id')
#     search_fields = ('identifier',)


# class ParameterTypeAdmin(admin.ModelAdmin):
#     list_display = ('name', 'description')
#     search_fields = ('name',)


# class ComponentParameterAdmin(admin.ModelAdmin):
#     list_display = ('component', 'parameter_type', 'value')
#     search_fields = ('component__name', 'parameter_type__name')


# class DocumentAdmin(admin.ModelAdmin):
#     list_display = ('name', 'uuid', 'component', 'doc_type', 'url')
#     search_fields = ('name', 'component__name')
#     list_filter = ('doc_type',)


# class SupplierAdmin(admin.ModelAdmin):
#     list_display = ('name', 'uuid', 'contact_info', 'website', 'min_order_quantity')
#     search_fields = ('name', 'uuid')


# class SupplierRelationAdmin(admin.ModelAdmin):
#     list_display = ('component', 'supplier', 'symbol')
#     search_fields = ('component__name', 'supplier__name', 'symbol')


# class TagAdmin(admin.ModelAdmin):
#     list_display = ('name',)
#     search_fields = ('name',)


# class CategoryAdmin(admin.ModelAdmin):
#     list_display = ('name', 'abbreviation', 'parent')
#     search_fields = ('name', 'abbreviation')
#     list_filter = ('parent',)


# class WarehouseAdmin(admin.ModelAdmin):
#     list_display = ('name', 'uuid', 'location', 'parent', 'can_store_items')
#     search_fields = ('name', 'location')
#     list_filter = ('parent', 'can_store_items')


# class BatchAdmin(admin.ModelAdmin):
#     list_display = ('component', 'warehouse', 'uuid', 'is_trackable', 'date_added')
#     search_fields = ('component__name', 'warehouse__name', 'uuid')
#     list_filter = ('warehouse', 'is_trackable')


# class StockOperationAdmin(admin.ModelAdmin):
#     list_display = ('batch', 'operation_type', 'quantity', 'timestamp', 'unit_price')
#     search_fields = ('batch__component__name', 'batch__warehouse__name')
#     list_filter = ('operation_type', 'timestamp')


# class ReservationAdmin(admin.ModelAdmin):
#     list_display = ('component', 'quantity', 'reserved_by', 'reservation_date', 'expiration_date')
#     search_fields = ('component__name', 'reserved_by')
#     list_filter = ('reservation_date', 'expiration_date')


# admin.site.register(Component, ComponentAdmin)
# admin.site.register(Identifier, IdentifierAdmin)
# admin.site.register(ParameterType, ParameterTypeAdmin)
# admin.site.register(ComponentParameter, ComponentParameterAdmin)
# admin.site.register(Document, DocumentAdmin)
# admin.site.register(Supplier, SupplierAdmin)
# admin.site.register(SupplierRelation, SupplierRelationAdmin)
# admin.site.register(Tag, TagAdmin)
# admin.site.register(Category, CategoryAdmin)
# admin.site.register(Batch, BatchAdmin)
# admin.site.register(StockOperation, StockOperationAdmin)
# admin.site.register(Reservation, ReservationAdmin)
# admin.site.register(PriceHistory)

admin.site.register(User)
admin.site.register(UserSetting)
