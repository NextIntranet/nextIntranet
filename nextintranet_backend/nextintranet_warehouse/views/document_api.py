from rest_framework import generics
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from nextintranet_backend.permissions import AreaAccessPermission

from django.shortcuts import get_object_or_404

from ..models.component import Document, Component
from .document import DocumentSerializer


class ComponentDocumentListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'guest'
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        component_id = self.kwargs.get('pk')
        return Document.objects.filter(component_id=component_id).order_by('-created_at')

    def perform_create(self, serializer):
        component = get_object_or_404(Component, pk=self.kwargs.get('pk'))
        if serializer.validated_data.get('is_primary'):
            Document.objects.filter(component=component, is_primary=True).update(is_primary=False)
        serializer.save(component=component)


class DocumentDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated, AreaAccessPermission]
    required_permission_area = 'warehouse'
    required_level = 'guest'
    queryset = Document.objects.all()

    def perform_update(self, serializer):
        if serializer.validated_data.get('is_primary'):
            Document.objects.filter(component=serializer.instance.component, is_primary=True).exclude(id=serializer.instance.id).update(is_primary=False)
            serializer.validated_data['access_level'] = 'public'
        serializer.save()


class ComponentDocumentDetailAPIView(DocumentDetailAPIView):
    def get_queryset(self):
        component_id = self.kwargs.get('component_id')
        return Document.objects.filter(component_id=component_id)
