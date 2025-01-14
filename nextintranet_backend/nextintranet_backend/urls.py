"""
URL configuration for nextintranet_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from django.urls import path
from django.contrib.auth.views import LogoutView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from graphene_django.views import GraphQLView

from .views import LogoutAPIView
from .views import user
# from .views.components import ComponentListAPIView
# from ..nextintranet_warehouse.views.warehouse import WarehouseListAPIView, WarehouseDetailAPIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .api import RegisterView
from django.contrib.auth import views as auth_views
from django.urls import include

from .views import home
from .views import auth
from .urls_api import urlpatterns as api_urls


from nextintranet_warehouse import urls as warehouse_urls

urlpatterns = [
    path('admin/', admin.site.urls),

    path('api/', include(api_urls)),

    path("select2/", include("django_select2.urls")),

    #path('login/', auth_views.LoginView.as_view(template_name='auth/login.html'), name='login'),
    path('login/', auth.login_view, name='login'),
    path('logout/', auth.logout_view, name='logout'),
    path('password_reset/', auth_views.PasswordResetView.as_view(), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),

    path('', home.HomeView.as_view(), name='home'),

    # path('warehouse/', include(warehouse_urls)),
    path('store/', include(warehouse_urls)), # deprecated
]
