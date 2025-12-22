
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.urls import path
from django.contrib.auth.views import LogoutView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import generics, filters
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers

from ..models import User
from ..help.crud import NIT_Table
from ..views.crud import create_crud_urls
import django_tables2 as tables
# from ..models.component import Component, Category, Document, Batch, SupplierRelation, Supplier



from nextintranet_backend.serializers.user import UserSerializer

class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]  # Pouze pro přihlášené uživatele

    def get(self, request):
        user = request.user  # Přihlášený uživatel
        print("Get user info")
        print(user)
        serializer = UserSerializer(user)
        return Response(serializer.data)

class UserApiDetailedView(APIView):
    permission_classes = [IsAuthenticated]  # Pouze pro přihlášené uživatele

    def get(self, request):
        user = request.user  # Přihlášený uživatel
        print("Get user info")
        print(user)
        serializer = UserSerializer(user)
        return Response(serializer.data)



class UserTableView(NIT_Table):
    class Meta(NIT_Table.Meta):
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'is_staff', 'is_superuser', 'last_login', 'date_joined')
    #id = tables.LinkColumn('user-detail', args=[tables.A('id')], verbose_name='ID')

urlpatterns = create_crud_urls(User, base_url="user", table_class_object=UserTableView)