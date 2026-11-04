from unittest import mock

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from nextintranet_warehouse.models.component import Component, Supplier, SupplierRelation
from nextintranet_warehouse.models.currency import Currency
from nextintranet_warehouse.models.purchase import Purchase, PurchaseItem
from nextintranet_warehouse.services.mouser import create_mouser_cart
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

    @mock.patch("nextintranet_warehouse.services.mouser.requests.post")
    def test_cart_created(self, post):
        post.return_value.json.return_value = {"CartKey": "abc", "TotalItemCount": 1, "Errors": []}
        result = create_mouser_cart(self.purchase)
        self.assertEqual(result["cart_key"], "abc")
        kwargs = post.call_args.kwargs
        self.assertEqual(kwargs["json"], {"CartItems": [{"MouserPartNumber": "603-RC0603", "Quantity": 10}]})
        self.assertEqual(kwargs["params"]["currencyCode"], "EUR")

    def test_requires_config(self):
        self.supplier.api_config = {}
        self.supplier.save()
        with self.assertRaises(ValidationError):
            create_mouser_cart(self.purchase)
