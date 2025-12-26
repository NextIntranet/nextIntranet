
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.urls import path
from django.contrib.auth.views import LogoutView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import generics, filters, viewsets
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers

from ..models import User
from ..help.crud import NIT_Table
from ..views.crud import create_crud_urls
import django_tables2 as tables
# from ..models.component import Component, Category, Document, Batch, SupplierRelation, Supplier



from nextintranet_backend.permissions import AreaAccessPermission
from nextintranet_backend.serializers.user import UserSerializer, UserAdminSerializer

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


class UserAdminPermission(AreaAccessPermission):
    def has_permission(self, request, view):
        if request.user and request.user.is_authenticated and request.user.is_superuser:
            return True
        if request.user and request.user.is_authenticated and view.action == 'retrieve':
            user_id = view.kwargs.get('pk')
            if user_id is not None and str(request.user.id) == str(user_id):
                return True
        return super().has_permission(request, view)


class UserAdminPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'


class UserAdminViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('id')
    serializer_class = UserAdminSerializer
    permission_classes = [IsAuthenticated, UserAdminPermission]
    required_permission_area = 'user'
    pagination_class = UserAdminPagination


class UserTableView(NIT_Table):
    class Meta(NIT_Table.Meta):
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'is_staff', 'is_superuser', 'last_login', 'date_joined')
    #id = tables.LinkColumn('user-detail', args=[tables.A('id')], verbose_name='ID')

urlpatterns = create_crud_urls(User, base_url="user", table_class_object=UserTableView)
