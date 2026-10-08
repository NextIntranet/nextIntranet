from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from nextintranet_warehouse.models.component import Component, Packet, PacketState, Reservation
from nextintranet_warehouse.models.warehouse import Warehouse
from nextintranet_warehouse.services.availability import component_availability, component_totals

from .models import Production, ProductionFolder, Template, TemplateComponent
from .services.bom import bom_availability_rows, unlink_component
from .services.reservations import ReservationError, reserve_bom, unreserve_bom


class ReservationScenarioTests(TestCase):
    """Warehouse Praha holds 100 pcs of A; BOMs B (10) and C (15) and a manual reservation (5)."""

    def setUp(self):
        self.praha = Warehouse.objects.create(name="Praha", is_warehouse=True)
        self.praha_shelf = Warehouse.objects.create(name="Shelf A", parent=self.praha, can_store_items=True)
        self.brno = Warehouse.objects.create(name="Brno", is_warehouse=True)
        self.brno_shelf = Warehouse.objects.create(name="Shelf B", parent=self.brno, can_store_items=True)

        self.part = Component.objects.create(name="A")
        self.packet = Packet.objects.create(component=self.part, location=self.praha_shelf, count=Decimal("100"))

        folder = ProductionFolder.objects.create(name="Folder")
        self.product = Production.objects.create(name="Board", folder=folder)
        self.bom_b, self.line_b = self._bom("B", 10)
        self.bom_c, self.line_c = self._bom("C", 15)

    def _bom(self, name, qty_per_board, qty_planned=1):
        template = Template.objects.create(production=self.product, name=name, qty_planned=qty_planned)
        line = TemplateComponent.objects.create(template=template, component=self.part, qty_per_board=qty_per_board)
        return template, line

    def _row(self, template, line):
        template.refresh_from_db()
        return next(r for r in bom_availability_rows(template) if r["id"] == str(line.id))

    def _reserve_all(self):
        reserve_bom(self.bom_b, warehouse_id=self.praha.id)
        reserve_bom(self.bom_c, warehouse_id=self.praha.id)
        Reservation.objects.create(component=self.part, quantity=5, reserved_by="tester", warehouse=self.praha)

    def test_each_bom_sees_reservations_of_everyone_else(self):
        self._reserve_all()

        row_b = self._row(self.bom_b, self.line_b)
        row_c = self._row(self.bom_c, self.line_c)

        self.assertEqual(row_b["here"]["reserved_by_others"], 20)  # C 15 + manual 5
        self.assertEqual(row_b["in_stock"], 80)
        self.assertEqual(row_c["in_stock"], 85)
        self.assertEqual(row_b["status"], "ok")
        self.assertEqual(component_availability([self.part.id])[self.part.id].in_warehouse(self.praha.id).free, 70)
        self.assertEqual(self.part.count, Decimal("70"))

    def test_unreserved_bom_holds_nothing(self):
        self.assertEqual(self._row(self.bom_c, self.line_c)["in_stock"], 100)
        reserve_bom(self.bom_b, warehouse_id=self.praha.id)
        self.assertEqual(self._row(self.bom_c, self.line_c)["in_stock"], 90)
        unreserve_bom(self.bom_b)
        self.assertEqual(self._row(self.bom_c, self.line_c)["in_stock"], 100)

    def test_placed_parts_are_not_counted_twice(self):
        self._reserve_all()
        # Placing 10 on B: stock drops by 10, B's remaining demand drops to 0.
        self.packet.count = Decimal("90")
        self.packet.save()
        self.line_b.placed_total = Decimal("10")
        self.line_b.save()

        self.assertEqual(self._row(self.bom_c, self.line_c)["in_stock"], 85)
        self.assertEqual(self._row(self.bom_b, self.line_b)["remaining"], 0)

    def test_finished_bom_releases_its_hold(self):
        self._reserve_all()
        self.bom_b.status = "finished"
        self.bom_b.save()

        self.assertEqual(self._row(self.bom_c, self.line_c)["in_stock"], 95)

    def test_hold_follows_planned_quantity(self):
        self._reserve_all()
        self.bom_b.qty_planned = 3
        self.bom_b.save()

        self.assertEqual(self._row(self.bom_c, self.line_c)["here"]["reserved_by_others"], 35)

    def test_unlinking_a_line_releases_it(self):
        self._reserve_all()
        unlink_component(self.line_b)

        self.assertEqual(self._row(self.bom_c, self.line_c)["here"]["reserved_by_others"], 5)

    def test_other_lines_of_the_same_bom_count(self):
        reserve_bom(self.bom_b, warehouse_id=self.praha.id)
        TemplateComponent.objects.create(template=self.bom_b, component=self.part, qty_per_board=95)

        row = self._row(self.bom_b, self.line_b)
        self.assertEqual(row["here"]["reserved_by_others"], 95)
        self.assertEqual(row["in_stock"], 5)
        self.assertEqual(row["status"], "missing")

    def test_expired_manual_reservation_is_ignored(self):
        Reservation.objects.create(
            component=self.part,
            quantity=50,
            reserved_by="tester",
            warehouse=self.praha,
            expiration_date=timezone.now() - timedelta(days=1),
        )
        self.assertEqual(self._row(self.bom_b, self.line_b)["in_stock"], 100)
        self.assertEqual(component_totals([self.part.id])[self.part.id]["reserved"], 0)

    def test_reservation_is_strictly_per_warehouse(self):
        Packet.objects.create(component=self.part, location=self.brno_shelf, count=Decimal("50"))
        Reservation.objects.create(component=self.part, quantity=40, reserved_by="tester", warehouse=self.brno)
        reserve_bom(self.bom_b, warehouse_id=self.praha.id)

        row = self._row(self.bom_b, self.line_b)
        self.assertEqual(row["here"]["on_hand"], 100)
        self.assertEqual(row["here"]["reserved_by_others"], 0)
        self.assertEqual(row["elsewhere"], [{"warehouse_id": str(self.brno.id), "free": 10}])

    def test_shortage_covered_by_another_warehouse_is_elsewhere(self):
        Packet.objects.create(component=self.part, location=self.brno_shelf, count=Decimal("50"))
        bom, line = self._bom("Big", 120)
        reserve_bom(bom, warehouse_id=self.praha.id)

        row = self._row(bom, line)
        self.assertEqual(row["status"], "elsewhere")
        self.assertTrue(row["shortage"])

        bom.qty_planned = 2
        bom.save()
        self.assertEqual(self._row(bom, line)["status"], "missing")

    def test_only_stocked_packets_count(self):
        Packet.objects.create(
            component=self.part, location=self.praha_shelf, count=Decimal("30"), state=PacketState.EXPECTED
        )
        self.assertEqual(self._row(self.bom_b, self.line_b)["here"]["on_hand"], 100)

    def test_unscoped_legacy_reservation_holds_in_every_warehouse(self):
        Reservation.objects.create(component=self.part, quantity=7, reserved_by="legacy")
        Packet.objects.create(component=self.part, location=self.brno_shelf, count=Decimal("50"))
        availability = component_availability([self.part.id])[self.part.id]

        self.assertEqual(availability.in_warehouse(self.praha.id).free, 93)
        self.assertEqual(availability.in_warehouse(self.brno.id).free, 43)
        self.assertEqual(availability.reserved, 7)

    def test_nested_warehouse_owns_its_subtree(self):
        annex = Warehouse.objects.create(name="Annex", parent=self.praha, is_warehouse=True)
        annex_shelf = Warehouse.objects.create(name="Shelf X", parent=annex, can_store_items=True)
        Packet.objects.create(component=self.part, location=annex_shelf, count=Decimal("20"))
        availability = component_availability([self.part.id])[self.part.id]

        self.assertEqual(availability.in_warehouse(self.praha.id).on_hand, 100)
        self.assertEqual(availability.in_warehouse(annex.id).on_hand, 20)

    def test_reserve_rules(self):
        with self.assertRaises(ReservationError):
            reserve_bom(self.bom_b)  # two warehouses, none chosen
        with self.assertRaises(ReservationError):
            reserve_bom(self.bom_b, warehouse_id=self.praha_shelf.id)  # not a warehouse
        with self.assertRaises(ReservationError):
            reserve_bom(self.bom_b, warehouse_id="not-a-uuid")
        self.bom_b.status = "finished"
        with self.assertRaises(ReservationError):
            reserve_bom(self.bom_b, warehouse_id=self.praha.id)


class ReservationApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser("admin", "admin@example.com", "pw")
        self.client = APIClient()
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.praha = Warehouse.objects.create(name="Praha", is_warehouse=True)
        self.shelf = Warehouse.objects.create(name="Shelf", parent=self.praha, can_store_items=True)
        self.part = Component.objects.create(name="A")
        Packet.objects.create(component=self.part, location=self.shelf, count=Decimal("100"))
        folder = ProductionFolder.objects.create(name="Folder")
        product = Production.objects.create(name="Board", folder=folder)
        self.bom = Template.objects.create(production=product, name="B", qty_planned=2)
        TemplateComponent.objects.create(template=self.bom, component=self.part, qty_per_board=10)

    def test_reserve_endpoint_defaults_to_the_only_warehouse(self):
        response = self.client.post(f"/api/v1/production/templates/{self.bom.id}/reserve/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.data["reserved"])
        self.assertEqual(response.data["stock_warehouse"], self.praha.id)

        used_in = self.client.get(f"/api/v1/production/productions/used-in/?component={self.part.id}").data
        self.assertEqual(used_in[0]["reserved_quantity"], 20)
        self.assertTrue(used_in[0]["reserved"])

        availability = self.client.get(f"/api/v1/production/templates/{self.bom.id}/availability/").data
        self.assertTrue(availability["reserved"])
        self.assertEqual(availability["rows"][0]["in_stock"], 100)

        response = self.client.post(f"/api/v1/production/templates/{self.bom.id}/unreserve/", {}, format="json")
        self.assertFalse(response.data["reserved"])

    def test_manual_reservation_gets_warehouse_and_counts(self):
        response = self.client.post(
            "/api/v1/store/reservations/", {"component_id": str(self.part.id), "quantity": 30}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["warehouse"], self.praha.id)

        detail = self.client.get(f"/api/v1/store/component/{self.part.id}/").data
        summary = detail["inventory_summary"]
        self.assertEqual(summary["reserved_quantity"], 30)
        self.assertEqual(summary["warehouses"][0]["free"], 70)

    def test_manual_reservation_rejects_non_warehouse(self):
        response = self.client.post(
            "/api/v1/store/reservations/",
            {"component_id": str(self.part.id), "quantity": 1, "warehouse": self.shelf.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_component_list_reserved_matches_service(self):
        Reservation.objects.create(component=self.part, quantity=5, reserved_by="tester", warehouse=self.praha)
        self.client.post(f"/api/v1/production/templates/{self.bom.id}/reserve/", {}, format="json")
        self.bom.components.update(placed_total=Decimal("4"))

        response = self.client.get("/api/v1/store/components/", {"search": "A"})
        self.assertEqual(response.status_code, 200, response.content)
        row = next(r for r in response.data["results"] if r["id"] == str(self.part.id))
        self.assertEqual(row["inventory_summary"]["reserved_quantity"], 21)  # 5 manual + (20 − 4) production
        self.assertEqual(row["inventory_summary"]["total_quantity"], 100)

    def test_mcp_bom_serializer_exposes_reservation(self):
        from .mcp_serializers import MCPBomDetailSerializer

        data = MCPBomDetailSerializer(self.bom).data
        self.assertFalse(data["reserved"])
        self.assertIsNone(data["stock_warehouse_id"])

    def test_mcp_reservation_serializer_handles_uuid_warehouse(self):
        from nextintranet_warehouse.mcp_serializers import MCPReservationSerializer

        reservation = Reservation.objects.create(component=self.part, quantity=1, reserved_by="t", warehouse=self.praha)
        data = MCPReservationSerializer(reservation).data
        self.assertEqual(data["warehouse_id"], str(self.praha.id))
        self.assertEqual(data["warehouse_name"], "Praha")
