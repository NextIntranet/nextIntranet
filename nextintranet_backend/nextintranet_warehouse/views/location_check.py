import django_filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, serializers, viewsets
from rest_framework.permissions import IsAuthenticated

from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter

from ..models.component import Packet
from ..models.location_check import LocationCheck
from ..models.warehouse import Warehouse
from .packets import CustomPagination


def _packet_entry(packet):
    return {
        "id": str(packet.id),
        "component": packet.component.name if packet.component_id else "",
        "serial_code": packet.serial_code or "",
        "location": packet.location.full_path if packet.location_id else None,
    }


class LocationCheckSerializer(serializers.ModelSerializer):
    """The client reports what it scanned; the buckets are computed here from live data."""

    found = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False, default=list
    )
    unexpected = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False, default=list
    )
    location = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all())
    location_path = serializers.CharField(source="location.full_path", read_only=True)
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = LocationCheck
        fields = [
            "id",
            "created_at",
            "location",
            "location_path",
            "author",
            "author_name",
            "include_children",
            "note",
            "expected_count",
            "confirmed_count",
            "missing_count",
            "unexpected_count",
            "details",
            "found",
            "unexpected",
        ]
        read_only_fields = [
            "author",
            "expected_count",
            "confirmed_count",
            "missing_count",
            "unexpected_count",
            "details",
        ]

    def get_author_name(self, obj):
        if not obj.author:
            return None
        return obj.author.get_full_name() or obj.author.get_username()

    def create(self, validated_data):
        found_ids = set(validated_data.pop("found", []))
        unexpected_ids = set(validated_data.pop("unexpected", []))
        location = validated_data["location"]
        include_children = validated_data.get("include_children", True)

        packets = Packet.objects.select_related("component", "location")
        if include_children:
            scope = location.get_descendants(include_self=True)
            expected = packets.filter(location__in=scope, is_active=True)
        else:
            expected = packets.filter(location=location, is_active=True)
        expected = list(expected.order_by("component__name", "serial_number"))
        expected_ids = {packet.id for packet in expected}

        confirmed = [packet for packet in expected if packet.id in found_ids]
        missing = [packet for packet in expected if packet.id not in found_ids]
        # Anything scanned that is not expected here is unexpected, whichever list
        # the client put it in.
        foreign_ids = (unexpected_ids | found_ids) - expected_ids
        unexpected = list(
            packets.filter(id__in=foreign_ids).order_by("component__name", "serial_number")
        )

        request = self.context.get("request")
        user = getattr(request, "user", None)
        return LocationCheck.objects.create(
            author=user if user and user.is_authenticated else None,
            expected_count=len(expected),
            confirmed_count=len(confirmed),
            missing_count=len(missing),
            unexpected_count=len(unexpected),
            details={
                "confirmed": [_packet_entry(packet) for packet in confirmed],
                "missing": [_packet_entry(packet) for packet in missing],
                "unexpected": [_packet_entry(packet) for packet in unexpected],
            },
            **validated_data,
        )


class LocationCheckFilter(django_filters.FilterSet):
    class Meta:
        model = LocationCheck
        fields = ["location", "author"]


class LocationCheckViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Saved location checks: newest first, filterable by ``location``. Records are immutable."""

    queryset = LocationCheck.objects.select_related("location", "author")
    serializer_class = LocationCheckSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = CustomPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = LocationCheckFilter


LocationCheckRouter = DefaultRouter()
LocationCheckRouter.register(r"", LocationCheckViewSet, basename="location-check")
