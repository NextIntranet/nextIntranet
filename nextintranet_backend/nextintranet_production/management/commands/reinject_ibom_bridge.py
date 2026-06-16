"""
Re-inject the latest NextIntranet bridge into already-stored iBOM files.

Existing iBOM uploads keep whatever bridge version they were saved with.
This command rewrites each Template.ibom_file in place with the current
bridge (replacing any older injected block), so features added to the bridge
reach files that were uploaded earlier.

    python manage.py reinject_ibom_bridge
    python manage.py reinject_ibom_bridge --dry-run
    python manage.py reinject_ibom_bridge --template <uuid>
"""
import os

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from nextintranet_production.models.production import Template
from nextintranet_production.ibom_bridge import inject_ni_bridge


class Command(BaseCommand):
    help = "Re-inject the latest NI bridge into stored Template iBOM files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing files.",
        )
        parser.add_argument(
            "--template",
            dest="template_id",
            default=None,
            help="Limit to a single Template by id.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        qs = Template.objects.exclude(ibom_file="").exclude(ibom_file__isnull=True)
        if options["template_id"]:
            qs = qs.filter(id=options["template_id"])

        total = updated = skipped = errors = 0

        for template in qs.iterator():
            total += 1
            field = template.ibom_file
            label = f"{template.id} ({template})"
            try:
                with field.open("rb") as fh:
                    raw = fh.read().decode("utf-8", errors="replace")
            except Exception as exc:  # noqa: BLE001 - report and continue
                errors += 1
                self.stderr.write(self.style.ERROR(f"  read failed: {label}: {exc}"))
                continue

            patched = inject_ni_bridge(raw)
            if patched == raw:
                skipped += 1
                self.stdout.write(f"  unchanged: {label}")
                continue

            updated += 1
            if dry_run:
                self.stdout.write(self.style.WARNING(f"  would update: {label}"))
                continue

            name = os.path.basename(field.name)
            # save(save=False) keeps the same storage key; persist the FK row after.
            field.save(name, ContentFile(patched.encode("utf-8")), save=False)
            template.save(update_fields=["ibom_file"])
            self.stdout.write(self.style.SUCCESS(f"  updated: {label}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. total={total} updated={updated} unchanged={skipped} errors={errors}"
                + (" (dry-run)" if dry_run else "")
            )
        )
