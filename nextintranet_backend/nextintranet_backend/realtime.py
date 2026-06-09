import asyncio
import logging
import time
import uuid
from typing import Optional

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def build_event(
    event_type: str,
    payload: dict,
    station_id: Optional[str] = None,
    device_id: Optional[str] = None
) -> dict:
    return {
        'id': str(uuid.uuid4()),
        'type': event_type,
        'stationId': station_id,
        'deviceId': device_id,
        'ts': int(time.time() * 1000),
        'payload': payload or {},
    }


def broadcast_event(
    event_type: str,
    payload: dict,
    group: str = 'broadcast',
    station_id: Optional[str] = None,
    device_id: Optional[str] = None,
) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    event = build_event(event_type, payload, station_id=station_id, device_id=device_id)
    message = {
        'type': 'broadcast.message',
        'event': event,
    }

    async def _send() -> None:
        await channel_layer.group_send(group, message)

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # WSGI workers (runserver/gunicorn sync): no event loop; avoid async_to_sync
        # thread pool, which breaks on Python 3.14 during transaction.on_commit.
        try:
            asyncio.run(_send())
        except Exception:
            logger.warning("Failed to broadcast realtime event", exc_info=True)
        return

    try:
        async_to_sync(channel_layer.group_send)(group, message)
    except RuntimeError as exc:
        if "interpreter shutdown" not in str(exc).lower():
            raise
        logger.warning("Skipped realtime broadcast during interpreter shutdown")
    except Exception:
        logger.warning("Failed to broadcast realtime event", exc_info=True)
