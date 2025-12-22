from rest_framework import serializers

from rest_framework.permissions import IsAuthenticated
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from nextintranet_warehouse.models import Warehouse
from nextintranet_warehouse.models import Warehouse

from django.views.generic import DetailView, ListView

from ..models.component import Tag

import django_tables2 as tables


from nextintranet_backend.views.crud import create_crud_urls
from nextintranet_backend.help.crud import NIT_Table


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = '__all__'

class TagListAPIView(generics.ListAPIView):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]


class TagModelTable(NIT_Table):
    class Meta(NIT_Table.Meta):
        model = Tag
        fields = ('id', 'name', 'abbreviation', 'description', 'parent_category', 'color', 'icon')
    
    id = tables.LinkColumn('category-detail', args=[tables.A('pk')], verbose_name='ID')


urlpatterns = create_crud_urls(Tag, table_class_object=TagModelTable)
print(urlpatterns)
