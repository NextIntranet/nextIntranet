from rest_framework import serializers
from nextintranet_backend.models.printList import PrintList, PrintItem

class PrintItemSerializer(serializers.ModelSerializer):
    """
    Serializer for PrintItem model.
    """
    class Meta:
        model = PrintItem
        fields = '__all__'


class PrintListSerializer(serializers.ModelSerializer):
    """
    Serializer for PrintList model.
    Includes nested PrintItems.
    """
    items = PrintItemSerializer(many=True, read_only=True, source='printitem_set')

    class Meta:
        model = PrintList
        fields = '__all__'
        # read_only_fields = ['owner', 'created_at', 'updated_at']