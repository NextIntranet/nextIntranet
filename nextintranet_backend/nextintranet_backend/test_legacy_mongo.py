from django.test import SimpleTestCase

from nextintranet_backend.legacy_mongo import (
    build_legacy_iso15434_barcode,
    legacy_serial_from_oid,
    oid_to_uuid4,
    production_date_from_oid,
)
from nextintranet_backend.iso15434 import EOT, GS, RS, parse_iso15434


class LegacyMongoTests(SimpleTestCase):
    def test_oid_to_uuid4_is_deterministic(self):
        first = oid_to_uuid4("62ff3dff23a67290bdc7ebeb")
        second = oid_to_uuid4("62ff3dff23a67290bdc7ebeb")
        self.assertEqual(first, second)

    def test_production_date_from_object_id(self):
        self.assertEqual(production_date_from_oid("62ff3dff23a67290bdc7ebeb"), "220819")

    def test_rebuilt_barcode_parses_back(self):
        mongo_oid = "62ff3dff23a67290bdc7ebeb"
        barcode = build_legacy_iso15434_barcode(mongo_oid)
        parsed = parse_iso15434(barcode)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.serial_number, legacy_serial_from_oid(mongo_oid))
        self.assertEqual(parsed.fields["5D"], "220819")

    def test_user_example_serial(self):
        mongo_oid = "64a3c90d76c82a1d3b578409"
        barcode = build_legacy_iso15434_barcode(mongo_oid)
        parsed = parse_iso15434(barcode)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.serial_number, mongo_oid)
        self.assertEqual(parsed.fields["5D"], production_date_from_oid(mongo_oid))
