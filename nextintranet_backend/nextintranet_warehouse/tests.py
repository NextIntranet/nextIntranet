from unittest import mock

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from nextintranet_warehouse.models.component import Component, Supplier, SupplierRelation
from nextintranet_warehouse.models.currency import Currency
from nextintranet_warehouse.models.purchase import Purchase, PurchaseItem
from nextintranet_warehouse.services.mouser import fetch_mouser_cart, sync_mouser_cart, unlink_mouser_cart
from nextintranet_warehouse.views.purchases import PurchaseWriteSerializer


class CurrencyTests(TestCase):
    def test_seeded_and_validated(self):
        self.assertTrue(Currency.objects.filter(code="EUR").exists())
        serializer = PurchaseWriteSerializer()
        self.assertEqual(serializer.validate_currency("eur"), "EUR")
        with self.assertRaises(Exception):
            serializer.validate_currency("XXX")


class MouserCartTests(TestCase):
    def setUp(self):
        self.supplier = Supplier.objects.create(
            name="Mouser",
            api_config={"order_api": {"provider": "mouser", "api_key": "k", "country_code": "CZ"}},
        )
        component = Component.objects.create(name="R1")
        relation = SupplierRelation.objects.create(component=component, supplier=self.supplier, symbol="603-RC0603")
        self.purchase = Purchase.objects.create(supplier=self.supplier, currency="EUR")
        PurchaseItem.objects.create(
            purchase=self.purchase, component=component, supplier_relation=relation,
            symbol="603-RC0603", quantity=10, unit_price_original=1, unit_price_converted=1,
        )

    @mock.patch("nextintranet_warehouse.services.mouser.requests.request")
    def test_first_sync_creates_cart_and_stores_key(self, request):
        request.return_value.json.return_value = {"CartKey": "abc", "TotalItemCount": 1, "Errors": []}
        result = sync_mouser_cart(self.purchase)
        self.assertTrue(result["created"])
        self.assertEqual(request.call_args.args[:2], ("POST", "https://api.mouser.com/api/v1/cart/items/insert"))
        kwargs = request.call_args.kwargs
        self.assertEqual(kwargs["json"], {"CartItems": [{"MouserPartNumber": "603-RC0603", "Quantity": 10}]})
        self.assertEqual(kwargs["params"]["currencyCode"], "EUR")
        self.purchase.refresh_from_db()
        self.assertEqual(self.purchase.metadata["mouser_cart"]["cart_key"], "abc")

    @mock.patch("nextintranet_warehouse.services.mouser.requests.request")
    def test_second_sync_overwrites_linked_cart(self, request):
        self.purchase.metadata = {"mouser_cart": {"cart_key": "abc"}}
        self.purchase.save()
        request.return_value.json.return_value = {"CartKey": "abc", "Errors": []}
        result = sync_mouser_cart(self.purchase)
        self.assertFalse(result["created"])
        self.assertEqual(request.call_args.args[:2], ("POST", "https://api.mouser.com/api/v1/cart"))
        self.assertEqual(request.call_args.kwargs["json"]["CartKey"], "abc")

    @mock.patch("nextintranet_warehouse.services.mouser.requests.request")
    def test_empty_cart_key_is_an_error(self, request):
        request.return_value.json.return_value = {
            "CartKey": "00000000-0000-0000-0000-000000000000",
            "Errors": [{"PropertyName": "CartKey", "Message": "Required"}],
        }
        with self.assertRaises(ValidationError) as ctx:
            sync_mouser_cart(self.purchase)
        self.assertIn("CartKey: Required", str(ctx.exception.detail))
        self.purchase.refresh_from_db()
        self.assertFalse(self.purchase.metadata)

    @mock.patch("nextintranet_warehouse.services.mouser.requests.request")
    def test_fetch_reports_differences(self, request):
        self.purchase.metadata = {"mouser_cart": {"cart_key": "abc"}}
        self.purchase.save()
        request.return_value.json.return_value = {
            "CartKey": "abc",
            "Errors": [],
            "CartItems": [
                {"MouserPartNumber": "603-RC0603", "Quantity": 4, "UnitPrice": 1.5, "Errors": []},
                {"MouserPartNumber": "OTHER-1", "Quantity": 2, "Errors": []},
            ],
        }
        result = fetch_mouser_cart(self.purchase)
        self.assertFalse(result["in_sync"])
        self.assertEqual(result["quantity_differs"][0]["purchase_quantity"], 10)
        self.assertEqual(result["only_in_cart"][0]["part_number"], "OTHER-1")
        self.assertEqual(request.call_args.kwargs["params"]["cartKey"], "abc")

    def test_fetch_without_cart_fails(self):
        with self.assertRaises(ValidationError):
            fetch_mouser_cart(self.purchase)

    def test_unlink_removes_key(self):
        self.purchase.metadata = {"mouser_cart": {"cart_key": "abc"}, "other": 1}
        self.purchase.save()
        unlink_mouser_cart(self.purchase)
        self.purchase.refresh_from_db()
        self.assertEqual(self.purchase.metadata, {"other": 1})

    def test_requires_config(self):
        self.supplier.api_config = {}
        self.supplier.save()
        with self.assertRaises(ValidationError):
            sync_mouser_cart(self.purchase)
