from django.utils import timezone

from nextintranet_backend.realtime import broadcast_event
from ..models.packet_recalc_job import PacketRecalcJob
from ..services.packet_recalc import recalculate_all_packets

PROGRESS_BROADCAST_INTERVAL = 25


def run_packet_recalc_job(job_id):
    job = PacketRecalcJob.objects.get(id=job_id)
    if job.status not in {PacketRecalcJob.STATUS_QUEUED, PacketRecalcJob.STATUS_FAILED}:
        return

    job.status = PacketRecalcJob.STATUS_PROCESSING
    job.error = ""
    job.processed = 0
    job.save(update_fields=["status", "error", "processed"])

    def report(processed, total):
        if processed % PROGRESS_BROADCAST_INTERVAL == 0 or processed == total:
            job.processed = processed
            job.total = total
            job.save(update_fields=["processed", "total"])
        broadcast_event(
            "packet_recalc_progress",
            {"job_id": str(job.id), "processed": processed, "total": total, "status": job.status},
        )

    try:
        total = recalculate_all_packets(progress_callback=report)
        job.status = PacketRecalcJob.STATUS_DONE
        job.processed = total
        job.total = total
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "processed", "total", "completed_at"])
        broadcast_event(
            "packet_recalc_progress",
            {"job_id": str(job.id), "processed": total, "total": total, "status": job.status},
        )
    except Exception as exc:
        job.status = PacketRecalcJob.STATUS_FAILED
        job.error = str(exc)
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "error", "completed_at"])
        broadcast_event(
            "packet_recalc_progress",
            {"job_id": str(job.id), "processed": job.processed, "total": job.total, "status": job.status, "error": job.error},
        )
        raise
