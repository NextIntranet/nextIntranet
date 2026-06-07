from django.test import SimpleTestCase

from nextintranet_backend.iso15434 import EOT, GS, RS, parse_iso15434


class Iso15434ParserTests(SimpleTestCase):
    def test_example_scan(self):
        raw = f"[)>{RS}06{GS}S64a3c90d76c82a1d3b578409{GS}5D230709{RS}{EOT}"
        parsed = parse_iso15434(raw)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.serial_number, "64a3c90d76c82a1d3b578409")
        self.assertEqual(parsed.fields["5D"], "230709")

    def test_non_iso_scan_returns_none(self):
        self.assertIsNone(parse_iso15434("?packet=abc&type=packet;"))

    def test_to_dict(self):
        raw = f"[)>{RS}06{GS}Sabc123{GS}5D230709{RS}{EOT}"
        parsed = parse_iso15434(raw)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        data = parsed.to_dict()
        self.assertEqual(data["format"], "iso15434")
        self.assertEqual(data["serial_number"], "abc123")
