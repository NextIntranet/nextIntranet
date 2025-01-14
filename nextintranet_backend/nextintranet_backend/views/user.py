
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