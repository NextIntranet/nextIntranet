from django.db.models import Count
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from nextintranet_backend.models.user import User
from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter

from ..models.component import Packet, StockOperation
from ..models.stocktaking import Stocktaking


def get_stocktaking_progress_map(campaign_ids):
    campaign_ids = [campaign_id for campaign_id in campaign_ids if campaign_id]
    if not campaign_ids:
        return {}

    total_active_packets = Packet.objects.filter(is_active=True).count()
    total_inactive_packets = Packet.objects.filter(is_active=False).count()
    inventoried_rows = (
        StockOperation.objects.filter(
            operation_type="inventory",
            reference__in=campaign_ids,
        )
        .values("reference")
        .annotate(inventoried=Count("packet", distinct=True))
    )
    inventoried_by_id = {
        str(row["reference"]): row["inventoried"] for row in inventoried_rows
    }

    result = {}
    for campaign_id in campaign_ids:
        campaign_key = str(campaign_id)
        inventoried = inventoried_by_id.get(campaign_key, 0)
        pending = max(0, total_active_packets - inventoried)
        percent = (
            round(inventoried / total_active_packets * 100)
            if total_active_packets
            else 0
        )
        result[campaign_key] = {
            "total_packets": total_active_packets,
            "inactive_packets": total_inactive_packets,
            "inventoried_packets": inventoried,
            "pending_packets": pending,
            "progress_percent": percent,
        }
    return result


def empty_stocktaking_progress(total_packets=0, inactive_packets=0):
    return {
        "total_packets": total_packets,
        "inactive_packets": inactive_packets,
        "inventoried_packets": 0,
        "pending_packets": total_packets,
        "progress_percent": 0,
    }


class StocktakingProgressSerializer(serializers.Serializer):
    total_packets = serializers.IntegerField()
    inactive_packets = serializers.IntegerField()
    inventoried_packets = serializers.IntegerField()
    pending_packets = serializers.IntegerField()
    progress_percent = serializers.IntegerField()


class StocktakingSerializer(serializers.ModelSerializer):
    authors = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True,
        required=False,
    )
    authors_details = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

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
            "progress",
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

    def get_progress(self, instance):
        progress_map = self.context.get("progress_map", {})
        total_active_packets = self.context.get("total_active_packet_count", 0)
        total_inactive_packets = self.context.get("total_inactive_packet_count", 0)
        return progress_map.get(
            str(instance.pk),
            empty_stocktaking_progress(total_active_packets, total_inactive_packets),
        )

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

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["total_active_packet_count"] = Packet.objects.filter(
            is_active=True
        ).count()
        context["total_inactive_packet_count"] = Packet.objects.filter(
            is_active=False
        ).count()

        if self.action in ("list", "retrieve"):
            if self.action == "retrieve":
                campaign_id = self.kwargs.get("pk")
                campaign_ids = [campaign_id] if campaign_id else []
            else:
                campaign_ids = list(
                    self.filter_queryset(self.get_queryset()).values_list("pk", flat=True)
                )
            context["progress_map"] = get_stocktaking_progress_map(campaign_ids)

        return context

    @action(detail=True, methods=["get"], url_path="location-progress")
    def location_progress(self, request, pk=None):
        """
        Per-location inventory stats for one campaign. Counts are exact per
        location (no subtree aggregation) — the client rolls them up along
        the location tree.
        """
        self.get_object()  # 404 for unknown campaigns

        stats = {}

        def entry(location_id):
            key = str(location_id) if location_id else None
            if key not in stats:
                stats[key] = {
                    "location_id": key,
                    "total_packets": 0,
                    "inactive_packets": 0,
                    "inventoried_packets": 0,
                }
            return stats[key]

        active_rows = (
            Packet.objects.filter(is_active=True)
            .values("location")
            .annotate(total=Count("id"))
        )
        for row in active_rows:
            entry(row["location"])["total_packets"] = row["total"]

        inactive_rows = (
            Packet.objects.filter(is_active=False)
            .values("location")
            .annotate(total=Count("id"))
        )
        for row in inactive_rows:
            entry(row["location"])["inactive_packets"] = row["total"]

        inventoried_rows = (
            StockOperation.objects.filter(operation_type="inventory", reference=pk)
            .values("packet__location")
            .annotate(done=Count("packet", distinct=True))
        )
        for row in inventoried_rows:
            entry(row["packet__location"])["inventoried_packets"] = row["done"]

        return Response({"locations": list(stats.values())})


StocktakingRouter = DefaultRouter(trailing_slash=True)
StocktakingRouter.register(r"", StocktakingViewSet)
