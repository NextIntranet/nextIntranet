from ..models.component import Packet


def recalculate_all_packets(progress_callback=None):
    """
    Recompute count/itemValue/totalValue for every packet.

    progress_callback(processed, total), if given, is invoked after each
    packet is recalculated so callers can report progress (CLI output,
    job row updates, realtime broadcasts, ...).
    """
    packet_ids = list(Packet.objects.order_by('id').values_list('id', flat=True))
    total = len(packet_ids)
    for processed, packet_id in enumerate(packet_ids, start=1):
        Packet.objects.get(id=packet_id).calculate()
        if progress_callback:
            progress_callback(processed, total)
    return total
