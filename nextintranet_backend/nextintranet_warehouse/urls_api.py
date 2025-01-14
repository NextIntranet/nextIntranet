
from django.contrib import admin
from django.urls import path
from django.urls import path
from django.contrib.auth.views import LogoutView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import warehouse

# from .serializers.components import ComponentSerializer
from .views.components import ComponentListAPIView, ComponentDetailAPIView
from .views.warehouse import WarehousePositionsListAPIView
from .views.category import CategoryListAPIView
from .views.packets import PDFGeneratorView

# /api/v1/warehouse/
urlpatterns = [
    path('components/', ComponentListAPIView.as_view(), name='api_warehouse_components'),
    path('component/<uuid:pk>/', ComponentDetailAPIView.as_view(), name='api_warehouse_component_detail'),
    path('positions/', WarehousePositionsListAPIView.as_view(), name='api_warehouse_positions'),
    path('categories/', CategoryListAPIView.as_view(), name='api_warehouse_categories'),

    path('print/packet/<uuid:pk>/', PDFGeneratorView.as_view(), name='api_warehouse_print_packet'),
]
