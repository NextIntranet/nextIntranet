from django.core.management.base import BaseCommand

from nextintranet_warehouse.services.packet_recalc import recalculate_all_packets


class Command(BaseCommand):
    help = "Recompute count/itemValue/totalValue for every packet."

    def handle(self, *args, **options):
        def report(processed, total):
            if total and (processed % 100 == 0 or processed == total):
                self.stdout.write(f"Recalculated {processed}/{total} packets")

        total = recalculate_all_packets(progress_callback=report)
        self.stdout.write(self.style.SUCCESS(f"Done. Recalculated {total} packets."))
