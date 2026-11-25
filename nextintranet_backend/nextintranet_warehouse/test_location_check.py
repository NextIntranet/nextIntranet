from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from nextintranet_warehouse.models.component import Component, Packet
from nextintranet_warehouse.models.location_check import LocationCheck
from nextintranet_warehouse.models.warehouse import Warehouse

URL = "/api/v1/store/location-check/"


class LocationCheckApiTests(TestCase):
    """Shelf holds A and B, its Box holds C; D lives on another shelf."""

    def setUp(self):
        self.user = get_user_model().objects.create_superuser("admin", "admin@example.com", "pw")
        self.client = APIClient()
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        root = Warehouse.objects.create(name="Praha", is_warehouse=True)
        self.shelf = Warehouse.objects.create(name="Shelf", parent=root, can_store_items=True)
        self.box = Warehouse.objects.create(name="Box", parent=self.shelf, can_store_items=True)
        self.other = Warehouse.objects.create(name="Other", parent=root, can_store_items=True)

        def packet(name, location, **extra):
            return Packet.objects.create(
                component=Component.objects.create(name=name),
                location=location,
                count=Decimal("10"),
                **extra,
            )

        self.a = packet("A", self.shelf)
        self.b = packet("B", self.shelf)
        self.c = packet("C", self.box)
        self.d = packet("D", self.other)
        self.retired = packet("R", self.shelf, state="retired")

    def _post(self, **payload):
        return self.client.post(URL, {"location": str(self.shelf.id), **payload}, format="json")

    def test_buckets_are_computed_from_scanned_packets(self):
        response = self._post(found=[str(self.a.id), str(self.c.id)], unexpected=[str(self.d.id)])

        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual(
            (data["expected_count"], data["confirmed_count"], data["missing_count"], data["unexpected_count"]),
            (3, 2, 1, 1),
        )
        self.assertEqual([entry["component"] for entry in data["details"]["missing"]], ["B"])
        self.assertEqual([entry["component"] for entry in data["details"]["unexpected"]], ["D"])
        self.assertEqual(data["details"]["unexpected"][0]["location"], self.other.full_path)
        self.assertEqual(data["author"], self.user.id)

    def test_exact_location_treats_child_packets_as_unexpected(self):
        response = self._post(include_children=False, found=[str(self.a.id), str(self.c.id)])

        data = response.json()
        self.assertEqual(
            (data["expected_count"], data["confirmed_count"], data["missing_count"], data["unexpected_count"]),
            (2, 1, 1, 1),
        )
        self.assertEqual([entry["component"] for entry in data["details"]["unexpected"]], ["C"])

    def test_list_is_filtered_by_location_newest_first(self):
        self._post(note="first")
        self._post(note="second")
        self.client.post(URL, {"location": str(self.other.id)}, format="json")

        response = self.client.get(URL, {"location": str(self.shelf.id)})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["note"] for row in response.json()["results"]], ["second", "first"])

    def test_saved_checks_cannot_be_changed(self):
        check_id = self._post().json()["id"]

        self.assertEqual(self.client.patch(f"{URL}{check_id}/", {"note": "x"}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(f"{URL}{check_id}/").status_code, 405)
        self.assertEqual(LocationCheck.objects.count(), 1)

    def test_requires_authentication(self):
        self.assertEqual(APIClient().post(URL, {"location": str(self.shelf.id)}, format="json").status_code, 401)
