from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path

from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from nextintranet_backend.legacy_mongo import (
    iter_stock_components,
    oid_to_uuid4,
)
from nextintranet_warehouse.models.component import Component, Identifier
from nextintranet_warehouse.models.component import Packet

DEFAULT_DUMP_PATH = "/home/roman/Dokumenty/mongodump_20241227/USTintranet"
LEGACY_SCHEME = "legacy"
OTHER_SCHEME = "other"


@dataclass
class ImportFailure:
    reason: str
    component_name: str | None
    mongo_oid: str
    match_method: str = ""


@dataclass
class ImportReport:
    stats: dict = field(default_factory=dict)
    failures: list[ImportFailure] = field(default_factory=list)

    def components_summary(self) -> list[dict]:
        grouped: dict[str, dict] = defaultdict(lambda: {"count": 0, "reasons": set(), "entries": []})
        for failure in self.failures:
            name = failure.component_name or "(unknown name)"
            row = grouped[name]
            row["count"] += 1
            row["reasons"].add(failure.reason)
            row["entries"].append(asdict(failure))
        return [
            {
                "component_name": name,
                "count": data["count"],
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
        "Create external Identifier records for components from a legacy MongoDB stock dump. "
        "Stores the MongoDB ObjectId as a legacy identifier and optionally stores "
        "legacy barcodes from the 'barcode' field."
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
            "--include-barcodes",
            action="store_true",
            help="Also store barcodes from the legacy 'barcode' field as 'other' identifiers.",
        )
        parser.add_argument(
            "--no-name-fallback",
            action="store_true",
            help="Disable name-based fallback when no matching packet is found.",
        )
        parser.add_argument(
            "--failures-file",
            default="",
            help=(
                "Write JSON report of failed components to this path. "
                "Default: ./legacy_component_import_failures.json"
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
        include_barcodes = options["include_barcodes"]
        no_name_fallback = options["no_name_fallback"]
        verbose = options["verbose"]
        failures_file = (
            Path(options["failures_file"]).expanduser()
            if options["failures_file"]
            else Path("legacy_component_import_failures.json")
        )

        if not dump_path.is_dir():
            raise CommandError(f"Dump path does not exist: {dump_path}")

        component_ct = ContentType.objects.get_for_model(Component)
        report = ImportReport(
            stats={
                "seen": 0,
                "matched_via_packet": 0,
                "matched_via_name": 0,
                "created_legacy_oid": 0,
                "created_barcode": 0,
                "skipped_exists": 0,
                "skipped_no_component": 0,
                "skipped_ambiguous": 0,
            }
        )

        def ensure_identifier(
            scheme: str,
            identifier: str,
            component: Component,
            *,
            stat_key: str,
        ) -> None:
            exists = Identifier.objects.filter(
                scheme=scheme,
                identifier=identifier,
            ).exists()
            if exists:
                report.stats["skipped_exists"] += 1
                return

            if dry_run:
                if verbose:
                    self.stdout.write(
                        f"  would create [{scheme}] {identifier!r} → component {component.id} ({component.name!r})"
                    )
                report.stats[stat_key] += 1
                return

            Identifier.objects.create(
                scheme=scheme,
                identifier=identifier,
                content_type=component_ct,
                object_id=str(component.pk),
            )
            report.stats[stat_key] += 1

        try:
            component_iter = iter_stock_components(dump_path)
        except FileNotFoundError as exc:
            raise CommandError(str(exc)) from exc
        except ImportError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(f"Reading legacy components from {dump_path}")

        with transaction.atomic():
            for mongo_oid, component_name, barcodes, packet_oids in component_iter:
                report.stats["seen"] += 1
                component = None
                match_method = ""

                # --- Primární: párování přes packety (deterministické UUID) ---
                if packet_oids:
                    candidate_components: set[int] = set()
                    for p_oid in packet_oids:
                        packet = (
                            Packet.objects.filter(id=oid_to_uuid4(p_oid))
                            .select_related("component")
                            .first()
                        )
                        if packet:
                            candidate_components.add(packet.component_id)
                            component = packet.component

                    if len(candidate_components) > 1:
                        # packety ukazují na různé komponenty — neočekávaný stav
                        report.stats["skipped_ambiguous"] += 1
                        report.failures.append(
                            ImportFailure(
                                reason="packets_point_to_multiple_components",
                                component_name=component_name,
                                mongo_oid=mongo_oid,
                                match_method="packet",
                            )
                        )
                        continue

                    if component:
                        match_method = "packet"
                        report.stats["matched_via_packet"] += 1

                # --- Fallback: párování přes jméno ---
                if component is None and not no_name_fallback:
                    if not component_name:
                        report.stats["skipped_no_component"] += 1
                        report.failures.append(
                            ImportFailure(
                                reason="no_name_in_dump",
                                component_name=None,
                                mongo_oid=mongo_oid,
                                match_method="name",
                            )
                        )
                        continue

                    name_matches = list(Component.objects.filter(name__iexact=component_name))

                    if not name_matches:
                        report.stats["skipped_no_component"] += 1
                        report.failures.append(
                            ImportFailure(
                                reason="no_django_component",
                                component_name=component_name,
                                mongo_oid=mongo_oid,
                                match_method="name",
                            )
                        )
                        continue

                    if len(name_matches) > 1:
                        report.stats["skipped_ambiguous"] += 1
                        report.failures.append(
                            ImportFailure(
                                reason="ambiguous_name",
                                component_name=component_name,
                                mongo_oid=mongo_oid,
                                match_method="name",
                            )
                        )
                        continue

                    component = name_matches[0]
                    match_method = "name"
                    report.stats["matched_via_name"] += 1

                if component is None:
                    report.stats["skipped_no_component"] += 1
                    report.failures.append(
                        ImportFailure(
                            reason="no_match_found",
                            component_name=component_name,
                            mongo_oid=mongo_oid,
                        )
                    )
                    continue

                if verbose:
                    self.stdout.write(f"  [{match_method}] {component_name!r} → {component.id}")

                ensure_identifier(
                    LEGACY_SCHEME,
                    mongo_oid,
                    component,
                    stat_key="created_legacy_oid",
                )

                if include_barcodes:
                    for barcode in barcodes:
                        ensure_identifier(
                            OTHER_SCHEME,
                            barcode,
                            component,
                            stat_key="created_barcode",
                        )

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
            f"Legacy components seen:          {stats['seen']}\n"
            f"Matched via packet UUID:         {stats['matched_via_packet']}\n"
            f"Matched via name (fallback):     {stats['matched_via_name']}\n"
            f"Legacy OID identifiers created:  {stats['created_legacy_oid']}\n"
            f"Barcode identifiers created:     {stats['created_barcode']}\n"
            f"Already existed (skipped):       {stats['skipped_exists']}\n"
            f"No matching Django component:    {stats['skipped_no_component']}\n"
            f"Ambiguous (skipped):             {stats['skipped_ambiguous']}"
        )

        components = report.components_summary()
        if components:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Components with failed legacy identifier import:"))
            for row in components:
                reasons = ", ".join(row["reasons"])
                self.stdout.write(
                    f"  - {row['component_name']} ({row['count']} occurrence(s), {reasons})"
                )
            self.stdout.write("")
            self.stdout.write(f"Full failure report written to: {failures_file}")
        else:
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("No failures — all legacy components were mapped."))

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run — no changes were saved."))
        else:
            self.stdout.write(self.style.SUCCESS("Import finished."))
