from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path

from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from nextintranet_backend.legacy_mongo import (
    build_legacy_iso15434_barcode,
    iter_stock_packets,
    legacy_serial_from_oid,
    oid_to_uuid4,
)
from nextintranet_warehouse.models.component import Identifier, Packet

DEFAULT_DUMP_PATH = "/home/roman/Dokumenty/mongodump_20241227/USTintranet"
LEGACY_SCHEME = "legacy"


@dataclass
class ImportFailure:
    reason: str
    component_name: str | None
    mongo_oid: str
    expected_packet_uuid: str
    legacy_serial: str


@dataclass
class ImportReport:
    stats: dict = field(default_factory=dict)
    failures: list[ImportFailure] = field(default_factory=list)

    def components_summary(self) -> list[dict]:
        grouped: dict[str, dict] = defaultdict(lambda: {"failed_packets": 0, "reasons": set(), "entries": []})
        for failure in self.failures:
            name = failure.component_name or "(unknown component)"
            row = grouped[name]
            row["failed_packets"] += 1
            row["reasons"].add(failure.reason)
            row["entries"].append(asdict(failure))
        return [
            {
                "component_name": name,
                "failed_packets": data["failed_packets"],
                "reasons": sorted(data["reasons"]),
                "entries": data["entries"],
            }
            for name, data in sorted(grouped.items(), key=lambda item: item[0].lower())
        ]

    def to_dict(self) -> dict:
        return {
            "stats": self.stats,
            "failures": [asdict(f) for f in self.failures],
            "components": self.components_summary(),
        }


class Command(BaseCommand):
    help = (
        "Create external Identifier records for packets from a legacy MongoDB stock dump. "
        "Stores the ISO 15434 serial (MongoDB ObjectId hex) so old Data Matrix labels scan correctly."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dump-path",
            default=DEFAULT_DUMP_PATH,
            help=f"Path to USTintranet mongodump folder (default: {DEFAULT_DUMP_PATH}).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report actions without writing to the database.",
        )
        parser.add_argument(
            "--include-full-barcode",
            action="store_true",
            help="Also store the full reconstructed ISO 15434 barcode string as an identifier.",
        )
        parser.add_argument(
            "--failures-file",
            default="",
            help=(
                "Write JSON report of failed packets/components to this path. "
                "Default: ./legacy_import_failures.json"
            ),
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Print each identifier that would be or was created.",
        )

    def handle(self, *args, **options):
        dump_path = Path(options["dump_path"]).expanduser()
        dry_run = options["dry_run"]
        include_full = options["include_full_barcode"]
        verbose = options["verbose"]
        failures_file = (
            Path(options["failures_file"]).expanduser()
            if options["failures_file"]
            else Path("legacy_import_failures.json")
        )

        if not dump_path.is_dir():
            raise CommandError(f"Dump path does not exist: {dump_path}")

        packet_ct = ContentType.objects.get_for_model(Packet)
        report = ImportReport(
            stats={
                "seen": 0,
                "created_serial": 0,
                "created_barcode": 0,
                "skipped_exists": 0,
                "skipped_no_packet": 0,
            }
        )

        def ensure_identifier(
            identifier: str,
            packet: Packet,
            *,
            stat_key: str,
        ) -> None:
            exists = Identifier.objects.filter(
                scheme=LEGACY_SCHEME,
                identifier=identifier,
            ).exists()
            if exists:
                report.stats["skipped_exists"] += 1
                return

            if dry_run:
                if verbose:
                    self.stdout.write(
                        f"  would create [{LEGACY_SCHEME}] {identifier!r} → packet {packet.id}"
                    )
                report.stats[stat_key] += 1
                return

            Identifier.objects.create(
                scheme=LEGACY_SCHEME,
                identifier=identifier,
                content_type=packet_ct,
                object_id=str(packet.pk),
            )
            report.stats[stat_key] += 1

        try:
            packet_iter = iter_stock_packets(dump_path)
        except FileNotFoundError as exc:
            raise CommandError(str(exc)) from exc
        except ImportError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(f"Reading legacy packets from {dump_path}")

        with transaction.atomic():
            for mongo_oid, component_name in packet_iter:
                report.stats["seen"] += 1
                packet_uuid = oid_to_uuid4(mongo_oid)
                serial = legacy_serial_from_oid(mongo_oid)
                packet = Packet.objects.filter(id=packet_uuid).select_related("component").first()
                if not packet:
                    report.stats["skipped_no_packet"] += 1
                    report.failures.append(
                        ImportFailure(
                            reason="no_django_packet",
                            component_name=component_name,
                            mongo_oid=mongo_oid,
                            expected_packet_uuid=str(packet_uuid),
                            legacy_serial=serial,
                        )
                    )
                    continue

                ensure_identifier(serial, packet, stat_key="created_serial")

                if include_full:
                    barcode = build_legacy_iso15434_barcode(mongo_oid)
                    ensure_identifier(barcode, packet, stat_key="created_barcode")

            if dry_run:
                transaction.set_rollback(True)

        self._write_failures_report(failures_file, report)
        self._print_summary(report, failures_file, dry_run)

    def _write_failures_report(self, path: Path, report: ImportReport) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def _print_summary(self, report: ImportReport, failures_file: Path, dry_run: bool) -> None:
        stats = report.stats
        self.stdout.write("")
        self.stdout.write(
            f"Legacy packets seen: {stats['seen']}\n"
            f"Serial identifiers created: {stats['created_serial']}\n"
            f"Full barcode identifiers created: {stats['created_barcode']}\n"
            f"Already existed: {stats['skipped_exists']}\n"
            f"No matching Django packet: {stats['skipped_no_packet']}"
        )

        components = report.components_summary()
        if components:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Components with failed legacy identifier import:"))
            for row in components:
                reasons = ", ".join(row["reasons"])
                self.stdout.write(
                    f"  - {row['component_name']} ({row['failed_packets']} packet(s), {reasons})"
                )
            self.stdout.write("")
            self.stdout.write(f"Full failure report written to: {failures_file}")
        else:
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("No failures — all legacy packets were mapped."))

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run — no changes were saved."))
        else:
            self.stdout.write(self.style.SUCCESS("Import finished."))
