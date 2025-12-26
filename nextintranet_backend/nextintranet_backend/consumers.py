import time
import uuid

from channels.generic.websocket import AsyncJsonWebsocketConsumer


def _normalize_event(event: dict) -> dict:
    event = dict(event or {})
    event.setdefault('id', str(uuid.uuid4()))
    event.setdefault('ts', int(time.time() * 1000))
    event.setdefault('type', 'event')
    event.setdefault('payload', {})
    return event


class EventConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')
        print(f"WS connect: path={self.scope.get('path')} user={user}")
        if not user or not getattr(user, 'is_authenticated', False):
            print("WS connect: unauthenticated, closing")
            await self.close(code=4401)
            return

        self._groups = ['broadcast']
        station_id = self.scope.get('url_route', {}).get('kwargs', {}).get('station_id')
        if station_id:
            self.station_id = station_id
            self._groups.append(self._station_group(station_id))

        for group in self._groups:
            await self.channel_layer.group_add(group, self.channel_name)
            print(f"WS connect: joined group {group}")

        await self.accept()
        print("WS connect: accepted")

    async def disconnect(self, close_code):
        for group in getattr(self, '_groups', []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        event = _normalize_event(content)
        target_station = event.get('stationId') or getattr(self, 'station_id', None)
        target_group = self._station_group(target_station) if target_station else 'broadcast'
        print(f"WS receive: type={event.get('type')} target_group={target_group}")
        await self._send_group(target_group, event)

    async def _send_group(self, group: str, event: dict):
        print(f"WS send: group={group} type={event.get('type')}")
        await self.channel_layer.group_send(
            group,
            {'type': 'broadcast.message', 'event': _normalize_event(event)},
        )

    async def broadcast_message(self, event):
        print(f"WS broadcast_message: type={event.get('event', {}).get('type')}")
        await self.send_json(event.get('event', {}))

    @staticmethod
    def _station_group(station_id: str) -> str:
        return f'station-{station_id}'


class DataConsumer(EventConsumer):
    async def receive_json(self, content, **kwargs):
        action = content.get('action')
        if action == 'fetch_table_data':
            table_data = [
                {'id': 1, 'name': 'Item 1', 'value': '100'},
                {'id': 2, 'name': 'Item 2', 'value': '200'},
            ]
            await self.send_json(_normalize_event({
                'type': 'table_update',
                'payload': {'data': table_data},
            }))
            return

        await super().receive_json(content, **kwargs)
