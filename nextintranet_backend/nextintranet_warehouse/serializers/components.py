from rest_framework import serializers
from nextintranet_warehouse.models.component import Component

class ComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Component
        fields = '__all__'
        
