
from django.contrib import admin
from django.urls import path, include
from django.contrib.auth.views import LogoutView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


from .views import warehouse

# from .serializers.components import ComponentSerializer
from .views.components import ComponentListAPIView, ComponentDetailAPIView, ComponentParameterListAPIView, ComponentParameterCreateAPIView
from .views.warehouse import WarehousePositionsListAPIView, WarehousePositionsTreeAPIView
from .views.category import CategoryRouter
from .views.packets import PacketRouter, PacketListCreateAPIView, PDFGeneratorView, PacketOperationsAPIView
from .views.tags import TagListAPIView
from .views.supplier import SupplierRouter, SupplierRelationRouter, ComponentSuppliersRelationCreateAPIView, ComponentSuppliersRelationListAPIView, SupplierListCreateAPIView, SupplierDetailAPIView, SupplierRelationViewSet
# from .views.parameters import ParameterTypeListAPIView, ParameterTypeDetailAPIView, ComponentParameterDetailAPIView
from .views.locations import LocationRouter
from .views.parameters import ParameterRouter, ParameterTypeRouter
from .views.stockOperation import StockOperationRouter
from .views.purchase_requests import PurchaseRequestListAPIView, PurchaseRequestDetailAPIView
from .views.document_api import ComponentDocumentListCreateAPIView, ComponentDocumentDetailAPIView, DocumentDetailAPIView
from .views.reservations import ReservationListAPIView, ReservationDetailAPIView

# /api/v1/warehouse/
urlpatterns = [
    path('components/', ComponentListAPIView.as_view(), name='api_warehouse_components'),
    path('component/<uuid:pk>/', ComponentDetailAPIView.as_view(), name='api_warehouse_component_detail'),
    #path('component/<uuid:pk>/parameter/new/', ComponentParameterCreateAPIView.as_view(), name='api_warehouse_component_parameter_create'),
    #path('component/<uuid:pk>/parameter/', ComponentParameterListAPIView.as_view(), name='api_warehouse_component_parameters'),
    #path('parameter/<uuid:pk>/', ComponentParameterDetailAPIView.as_view(), name='api_warehouse_component_parameter_detail'),
    #  path('component/<uuid:pk>/supplier/new', ComponentSuppliersRelationCreateAPIView.as_view(), name='api_warehouse_component_suppliers'),
    path('component/<uuid:pk>/supplier/', ComponentSuppliersRelationListAPIView.as_view(), name='api_warehouse_component_suppliers'),
    path('component/<uuid:pk>/parameters/', ComponentParameterListAPIView.as_view(), name='api_warehouse_component_parameters'),
    path('component/<uuid:pk>/documents/', ComponentDocumentListCreateAPIView.as_view(), name='api_warehouse_component_documents'),
    path('component/<uuid:component_id>/documents/<uuid:pk>/', ComponentDocumentDetailAPIView.as_view(), name='api_warehouse_component_document_detail'),
    path('documents/<uuid:pk>/', DocumentDetailAPIView.as_view(), name='api_warehouse_document_detail'),

# Packets
    path('packet/operation/', include(StockOperationRouter.urls), name='api_warehouse_operations'),
    path('packet/', include(PacketRouter.urls), name='api_warehouse_packet_detail'),
    # path('packet/<uuid:pk>/operations/', PacketOperationsAPIView.as_view(), name='api_warehouse_packet_operations'),
    path('component/<uuid:pk>/packet/', PacketListCreateAPIView.as_view(), name='api_warehouse_component_packets'),

# Operations

# Parameter
   path('parameter/', include(ParameterRouter.urls), name='api_warehouse_parameters'),

# ParameterType
    path('parameterTypes/', include(ParameterTypeRouter.urls), name='api_warehouse_parameter_types'),

    path('positions/', WarehousePositionsListAPIView.as_view(), name='api_warehouse_positions'), # deprecated
    path('locations/tree/', WarehousePositionsTreeAPIView.as_view(), name='api_warehouse_locations_tree'),
    path('location/', include(LocationRouter.urls), name='api_warehouse_locations'),
    path('locations/', WarehousePositionsListAPIView.as_view(), name='api_warehouse_locations'),
    path('supplier/relation/', include(SupplierRelationRouter.urls), name='api_warehouse_supplier_relations'),
    path('supplier/', include(SupplierRouter.urls), name='api_warehouse_suppliers'),
    path('category/', include(CategoryRouter.urls), name='api_warehouse_categories'),
    path('tags/', TagListAPIView.as_view(), name='api_warehouse_tags'),
    path('purchase-requests/', PurchaseRequestListAPIView.as_view(), name='api_warehouse_purchase_requests'),
    path('purchase-request/<uuid:pk>/', PurchaseRequestDetailAPIView.as_view(), name='api_warehouse_purchase_request_detail'),
    path('reservations/', ReservationListAPIView.as_view(), name='api_warehouse_reservations'),
    path('reservation/<uuid:pk>/', ReservationDetailAPIView.as_view(), name='api_warehouse_reservation_detail'),
    #path('parameterTypes/', ParameterTypeListAPIView.as_view(), name='api_warehouse_parameter_types'),
    #path('parameterType/<uuid:pk>/', ParameterTypeDetailAPIView.as_view(), name='api_warehouse_parameter_type_detail'),
    path('print/packet/<uuid:uuid>/', PDFGeneratorView.as_view(), name='api_warehouse_print_packet'),

# Search
    # path('search/', warehouse.SearchView.as_view(), name='api_warehouse_search'),
]
