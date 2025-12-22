
from django.contrib import admin
from django.urls import path, include
from django.contrib.auth.views import LogoutView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import warehouse
from .views import supplier
from .views import components
from .views import stockOperation
from .views import document
from .views.packets import PDFGeneratorView
from .views import locations
from .views import parameters
from .views import category
from .views import api_source
from .views import api_create
from .views import stocktaking



# /store/
urlpatterns = [
    # path('', warehouse.item_list, name='component-list'),
    path('', warehouse.ComponentListView.as_view(), name='component-list'),

    
    path('supplier/relation/<uuid:uuid>/edit/', supplier.SupplierRelationEditView.as_view(), name='supplier-relation-edit'),
    path('supplier/relation/<uuid:uuid>/delete/', supplier.SupplierRelationDeleteView.as_view(), name='supplier-relation-delete'),
    path('supplier/', include(supplier.urlpatterns)),
    path('location/', include(locations.urlpatterns)),
    # path('parameter/', include(parameters.urlpatterns)),
    path('category/', include(category.urlpatterns)),
    path('api_source/', include(api_source.urlpatterns)),
    path('api_create/', include(api_create.urlpatterns)),

    path('packet/<uuid:uuid>/edit/', components.PacketEditView.as_view(), name='packet-edit'),
    path('packet/<uuid:uuid>/delete/', components.PacketDeleteView.as_view(), name='packet-delete'),
    path('packet/<uuid:uuid>/operation/', stockOperation.StockOperationCreateView.as_view(), name='packet-operation-add'),
    path('packet/<uuid:uuid>/print/', PDFGeneratorView.as_view(), name='packet-print'),
    path('component/<uuid:uuid>/new_supplier/', supplier.NewSupplierRelationView.as_view(), name='component-new-supplier'),
    path('component/<uuid:uuid>/new_packet/', components.PacketNewView.as_view(), name='component-new-packet'),
    path('component/<uuid:uuid>/parameters/edit/', components.ComponentParameterEditView.as_view(), name='component-edit-parameters'),
    path('component/<uuid:uuid>/parameters/add-row/', components.add_row, name='component-parameters-add-row'),
    path('component/<uuid:uuid>/document/edit/', document.ComponentDocumentEditView.as_view(), name='component-document-edit'),
    path('component/<uuid:uuid>/document/add-row/', document.document_add_row, name='component-document-add-row'),
    path('component/<uuid:uuid>/edit/', warehouse.ComponentEditView.as_view(), name='component-edit'),
    path('component/<uuid:uuid>/', warehouse.ComponentDetailView.as_view(), name='component-detail'),
    path('component/', include(components.urlpatterns)),

    path('stocktaking/', include(stocktaking.urlpatterns)),


    #path('stock/operation/new/', stockOperation.StockOperationCreateView.as_view(), name='stock-operation-create'),
]
