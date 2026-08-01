from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from .ibom_bridge import (
    _BLOCK_END,
    _BLOCK_START,
    _DETECTION_MARKER,
    inject_ni_bridge,
    inject_ni_bridge_into_upload,
    strip_ni_bridge,
)

MINIMAL_IBOM = "<html><head></head><body><div id='bomdiv'></div></body></html>"


class InjectNiBridgeTests(SimpleTestCase):
    def test_injects_marker_wrapped_block_before_body_close(self):
        result = inject_ni_bridge(MINIMAL_IBOM)

        self.assertIn(_BLOCK_START, result)
        self.assertIn(_BLOCK_END, result)
        self.assertIn(_DETECTION_MARKER, result)
        self.assertLess(result.index(_BLOCK_END), result.index("</body>"))
        self.assertIn("<div id='bomdiv'></div>", result)

    def test_reinjection_replaces_instead_of_stacking(self):
        once = inject_ni_bridge(MINIMAL_IBOM)
        twice = inject_ni_bridge(once)

        self.assertEqual(once, twice)
        self.assertEqual(twice.count(_BLOCK_START), 1)
        self.assertEqual(twice.count(_DETECTION_MARKER), once.count(_DETECTION_MARKER))

    def test_strip_removes_the_block_completely(self):
        stripped = strip_ni_bridge(inject_ni_bridge(MINIMAL_IBOM))

        self.assertNotIn(_BLOCK_START, stripped)
        self.assertNotIn(_DETECTION_MARKER, stripped)
        self.assertIn("<div id='bomdiv'></div>", stripped)

    def test_strip_removes_legacy_unmarked_script(self):
        # Injections predating the comment markers are recognised by the sentinel.
        legacy = (
            "<html><body><p>keep</p>"
            f'<script type="text/javascript">var x = 1; {_DETECTION_MARKER} = {{}};</script>'
            "</body></html>"
        )

        stripped = strip_ni_bridge(legacy)

        self.assertNotIn(_DETECTION_MARKER, stripped)
        self.assertIn("<p>keep</p>", stripped)

    def test_legacy_injection_is_upgraded_in_place(self):
        legacy = (
            "<html><body><p>keep</p>"
            f'<script type="text/javascript">{_DETECTION_MARKER} = "old";</script>'
            "</body></html>"
        )

        result = inject_ni_bridge(legacy)

        self.assertEqual(result.count(_BLOCK_START), 1)
        self.assertNotIn('{_DETECTION_MARKER} = "old"', result)
        self.assertIn("<p>keep</p>", result)

    def test_html_without_body_close_still_gets_the_bridge(self):
        result = inject_ni_bridge("<html><div id='bomdiv'></div>")

        self.assertIn(_BLOCK_START, result)
        self.assertTrue(result.rstrip().endswith(_BLOCK_END))

    def test_bridge_source_carries_the_grouping_module(self):
        result = inject_ni_bridge(MINIMAL_IBOM)

        # Guards against the JS file being emptied or the wrong file being read.
        self.assertIn("NIBridgeDebug", result)
        self.assertIn("ibom.grouping", result)
        self.assertIn("ibom-state", result)


class InjectNiBridgeIntoUploadTests(SimpleTestCase):
    def test_wraps_upload_and_injects_the_bridge(self):
        upload = SimpleUploadedFile("board.html", MINIMAL_IBOM.encode(), content_type="text/html")

        result = inject_ni_bridge_into_upload(upload)
        payload = result.read().decode("utf-8")

        self.assertIn(_BLOCK_START, payload)
        self.assertIn(_DETECTION_MARKER, payload)
        self.assertEqual(result.name, "board.html")
        self.assertEqual(result.content_type, "text/html")
        self.assertEqual(result.size, len(payload.encode("utf-8")))

    def test_reupload_of_a_patched_file_replaces_instead_of_stacking(self):
        first = inject_ni_bridge_into_upload(SimpleUploadedFile("board.html", MINIMAL_IBOM.encode()))

        second = inject_ni_bridge_into_upload(SimpleUploadedFile("board.html", first.read()))
        payload = second.read().decode("utf-8")

        self.assertEqual(payload.count(_BLOCK_START), 1)
        self.assertEqual(payload, inject_ni_bridge(MINIMAL_IBOM))
