from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from nextintranet_backend.models import Attachment, Note
from nextintranet_backend.models.userAccessPermission import UserAccessPermission
from nextintranet_backend.services.mentions import parse_mentions, plain_text
from nextintranet_warehouse.models.component import Component, Packet
from nextintranet_warehouse.models.warehouse import Warehouse

from .models import Production, ProductionFolder, Template, TemplateComponent

User = get_user_model()


def client_for(user) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


class _BomFixture(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="user@example.com", username="user", password="x")
        self.other = User.objects.create_user(email="other@example.com", username="other", password="x")
        self.client = client_for(self.user)

        store = Warehouse.objects.create(name="Praha", is_warehouse=True)
        self.shelf = Warehouse.objects.create(name="Shelf A", parent=store, can_store_items=True)
        self.resistor = Component.objects.create(name="R 10k", internal_price=0.5)
        self.mcu = Component.objects.create(name="ESP32-C3 Žluťoučký")
        Packet.objects.create(
            component=self.mcu, location=self.shelf, count=Decimal("10"), totalValue=Decimal("1000")
        )
        product = Production.objects.create(name="Board", folder=ProductionFolder.objects.create(name="F"))
        self.bom = Template.objects.create(production=product, name="Series 1", qty_planned=2)
        TemplateComponent.objects.create(template=self.bom, component=self.resistor, qty_per_board=4, value="10k")
        TemplateComponent.objects.create(template=self.bom, component=self.mcu, qty_per_board=1)
        TemplateComponent.objects.create(template=self.bom, component=None, qty_per_board=2, value="NC")
        TemplateComponent.objects.create(template=self.bom, component=self.resistor, qty_per_board=3, dnp=True)

    def url(self, suffix=""):
        return f"/api/v1/production/templates/{self.bom.id}/{suffix}"


class SummaryTests(_BomFixture):
    def test_counts_and_cost(self):
        data = self.client.get(self.url("summary/")).json()

        self.assertEqual(data["parts"]["active_lines"], 3)
        self.assertEqual(data["parts"]["component_types"], 2)
        self.assertEqual(data["parts"]["unlinked_lines"], 1)
        self.assertEqual(data["parts"]["dnp_lines"], 1)
        self.assertEqual(data["parts"]["parts_per_board"], 7)
        self.assertEqual(data["parts"]["parts_total"], 14)
        # R: 4 × 0.5 (internal), MCU: 1 × 100 (stock value 1000 / 10 pcs).
        self.assertAlmostEqual(data["cost"]["per_board"], 102.0)
        self.assertAlmostEqual(data["cost"]["total"], 204.0)
        self.assertEqual(data["cost"]["priced_lines"], 2)
        self.assertFalse(data["can_admin_edit"])


class LockedEditTests(_BomFixture):
    def setUp(self):
        super().setUp()
        self.bom.status = "finished"
        self.bom.save()

    def test_regular_user_cannot_edit_closed_bom(self):
        response = self.client.patch(self.url(), {"name": "Renamed"}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_unchanged_fields_are_not_an_edit(self):
        response = self.client.patch(self.url(), {"name": "Series 1"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_production_admin_can_edit_header_only(self):
        UserAccessPermission.objects.create(user=self.user, area="production", level="admin")

        response = self.client.patch(self.url(), {"name": "Renamed", "planned_date": "2026-11-02"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.bom.refresh_from_db()
        self.assertEqual(self.bom.name, "Renamed")
        audit = Note.objects.get(object_id=str(self.bom.id))
        self.assertIn("Renamed", audit.body)

        response = self.client.patch(self.url(), {"qty_planned": 99}, format="json")
        self.assertEqual(response.status_code, 409)


class ExportTests(_BomFixture):
    def test_every_export_is_a_pdf(self):
        Note.objects.create(
            content_type_id=Attachment._meta.get_field("content_type").related_model.objects.get_for_model(Template).id,
            object_id=str(self.bom.id),
            author=self.user,
            body="Hotovo, díky [@Jan Novák](mention:user/1) — **příliš žluťoučký kůň**",
        )
        for kind in ("overview", "bom", "sourcing", "production", "finalize"):
            response = self.client.get(self.url(f"export/{kind}/"))
            self.assertEqual(response.status_code, 200, kind)
            self.assertEqual(response["Content-Type"], "application/pdf")
            self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"), kind)

    def test_unknown_export(self):
        self.assertEqual(self.client.get(self.url("export/nope/")).status_code, 404)


class MentionParsingTests(TestCase):
    def test_parse_links_and_shorthand(self):
        body = "Hi [@Jan](mention:user/42), check [#R](mention:component/abc-1) and [[packet:def-2]] [@Jan](mention:user/42)"
        self.assertEqual(
            parse_mentions(body),
            [("user", "42"), ("component", "abc-1"), ("packet", "def-2")],
        )
        self.assertEqual(plain_text("[@Jan](mention:user/42)"), "@Jan")

    def test_unknown_kinds_are_ignored(self):
        self.assertEqual(parse_mentions("[x](mention:evil/1)"), [])


@override_settings(STORAGES={
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
})
class NotesApiTests(_BomFixture):
    def target(self):
        return {"target": "production.template", "target_id": str(self.bom.id)}

    def test_note_crud_and_mentions(self):
        response = self.client.post(
            "/api/v1/core/notes/",
            {**self.target(), "body": f"Ping [@Other](mention:user/{self.other.id}) about [#R](mention:component/{self.resistor.id})"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        note = response.json()
        self.assertEqual(note["author"]["username"], "user")
        self.assertEqual({m["kind"] for m in note["mentions"]}, {"user", "component"})

        listing = self.client.get("/api/v1/core/notes/", self.target()).json()
        self.assertEqual([n["id"] for n in listing], [note["id"]])

        other = client_for(self.other)
        self.assertEqual(other.patch(f"/api/v1/core/notes/{note['id']}/", {"body": "x"}, format="json").status_code, 403)
        self.assertEqual(other.delete(f"/api/v1/core/notes/{note['id']}/").status_code, 403)

        edited = self.client.patch(f"/api/v1/core/notes/{note['id']}/", {"body": "plain"}, format="json").json()
        self.assertIsNotNone(edited["edited_at"])
        self.assertEqual(edited["mentions"], [])
        self.assertEqual(self.client.delete(f"/api/v1/core/notes/{note['id']}/").status_code, 204)

    def test_unknown_target_is_rejected(self):
        response = self.client.post(
            "/api/v1/core/notes/", {"target": "auth.user", "target_id": "1", "body": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/v1/core/notes/").status_code, 400)

    def test_attachment_upload_path_and_kind(self):
        photo = SimpleUploadedFile("board.JPG", b"\xff\xd8\xff", content_type="image/jpeg")
        response = self.client.post("/api/v1/core/attachments/", {**self.target(), "file": photo}, format="multipart")
        self.assertEqual(response.status_code, 201, response.content)
        attachment = Attachment.objects.get(id=response.json()[0]["id"])
        self.assertEqual(attachment.kind, "photo")
        self.assertRegex(attachment.file.name, r"^uploads/manufacturing/\d{4}/\d{2}/[0-9a-f-]{36}\.jpg$")

        summary = self.client.get(self.url("summary/")).json()
        self.assertEqual(summary["counts"]["photos"], 1)

    def test_user_lookup(self):
        data = self.client.get("/api/v1/core/users/lookup/", {"search": "oth"}).json()
        self.assertEqual([u["username"] for u in data], ["other"])
