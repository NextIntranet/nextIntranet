
from django.contrib import admin
from django.urls import path
from django.urls import path
from django.contrib.auth.views import LogoutView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import warehouse
from .views import supplier
from .views import components
from .views import stockOperation
from .views import document


# /store/
urlpatterns = [
    path('', warehouse.item_list, name='component-list'),
    path('supplier/relation/<uuid:uuid>/edit/', supplier.SupplierRelationEditView.as_view(), name='supplier-relation-edit'),
    path('supplier/relation/<uuid:uuid>/delete/', supplier.SupplierRelationDeleteView.as_view(), name='supplier-relation-delete'),
    path('packet/<uuid:uuid>/edit/', components.PacketEditView.as_view(), name='packet-edit'),
    path('packet/<uuid:uuid>/delete/', components.PacketDeleteView.as_view(), name='packet-delete'),
    path('packet/<uuid:uuid>/operation/', stockOperation.StockOperationCreateView.as_view(), name='packet-operation-add'),
    path('component/<uuid:uuid>/new_supplier/', supplier.NewSupplierRelationView.as_view(), name='component-new-supplier'),
    path('component/<uuid:uuid>/new_packet/', components.PacketNewView.as_view(), name='component-new-packet'),
    path('component/<uuid:uuid>/parameters/edit/', components.ComponentParameterEditView.as_view(), name='component-edit-parameters'),
    path('component/<uuid:uuid>/parameters/add-row/', components.add_row, name='component-add-row'),
    path('component/<uuid:uuid>/document/edit/', document.ComponentDocumentEditView.as_view(), name='component-document-edit'),
    path('component/<uuid:uuid>/document/add-row/', document.document_add_row, name='component-document-add-row'),
    path('component/<uuid:uuid>/edit/', warehouse.ComponentEditView.as_view(), name='component-edit'),
    path('component/<uuid:uuid>/', warehouse.ComponentDetailView.as_view(), name='component-detail'),

    #path('stock/operation/new/', stockOperation.StockOperationCreateView.as_view(), name='stock-operation-create'),
]
