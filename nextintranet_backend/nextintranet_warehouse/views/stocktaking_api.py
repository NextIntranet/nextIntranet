from django.db.models import Count, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated

from nextintranet_backend.models.user import User
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter

from ..models.component import Packet, StockOperation
from ..models.stocktaking import Stocktaking


class StocktakingSerializer(serializers.ModelSerializer):
    authors = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True,
        required=False,
    )
    authors_details = serializers.SerializerMethodField()
    inventoried_packet_count = serializers.IntegerField(read_only=True)
    total_packet_count = serializers.SerializerMethodField()

    class Meta:
        model = Stocktaking
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "open_from",
            "open_until",
            "target_date",
            "is_active",
            "authors",
            "authors_details",
            "inventoried_packet_count",
            "total_packet_count",
        ]

    def get_authors_details(self, instance):
        return [
            {
                "id": str(author.id),
                "username": author.username,
                "first_name": author.first_name,
                "last_name": author.last_name,
            }
            for author in instance.authors.all()
        ]

    def get_total_packet_count(self, instance):
        return self.context.get("total_active_packet_count", 0)

    def validate(self, attrs):
        is_active = attrs.get(
            "is_active",
            self.instance.is_active if self.instance else False,
        )
        if is_active:
            existing = Stocktaking.objects.filter(is_active=True)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(
                    {"is_active": "Only one stocktaking can be active at a time."}
                )
        return attrs


class StocktakingViewSet(viewsets.ModelViewSet):
    queryset = Stocktaking.objects.all().prefetch_related("authors")
    serializer_class = StocktakingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["is_active"]

    def get_queryset(self):
        inventoried_subquery = (
            StockOperation.objects.filter(
                operation_type="inventory",
                reference=OuterRef("pk"),
            )
            .values("reference")
            .annotate(count=Count("packet", distinct=True))
            .values("count")
        )
        return (
            super()
            .get_queryset()
            .annotate(
                inventoried_packet_count=Coalesce(
                    Subquery(inventoried_subquery[:1], output_field=IntegerField()),
                    0,
                )
            )
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["total_active_packet_count"] = Packet.objects.filter(is_active=True).count()
        return context


StocktakingRouter = DefaultRouter(trailing_slash=True)
StocktakingRouter.register(r"", StocktakingViewSet)
