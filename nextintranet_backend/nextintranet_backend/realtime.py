import time
import uuid
from typing import Optional

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


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
    async_to_sync(channel_layer.group_send)(
        group,
        {
            'type': 'broadcast.message',
            'event': event,
        },
    )
