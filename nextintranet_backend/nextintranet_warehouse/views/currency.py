from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated

from nextintranet_warehouse.models.currency import Currency


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ['id', 'code', 'name', 'rate_to_base', 'is_base', 'updated_at']
        read_only_fields = ['updated_at']

    def validate_code(self, value):
        return value.strip().upper()


class CurrencyViewSet(viewsets.ModelViewSet):
    queryset = Currency.objects.all()
    serializer_class = CurrencySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
