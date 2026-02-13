from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from nextintranet_backend.routers import NoFormatSuffixRouter as DefaultRouter
from nextintranet_backend.models.user import User
from ..models.stocktaking import Stocktaking


class StocktakingSerializer(serializers.ModelSerializer):
    authors = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True,
        required=False,
    )
    authors_details = serializers.SerializerMethodField()

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


StocktakingRouter = DefaultRouter(trailing_slash=True)
StocktakingRouter.register(r"", StocktakingViewSet)
