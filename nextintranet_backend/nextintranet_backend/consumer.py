import json
from channels.generic.websocket import AsyncWebsocketConsumer

class DataConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')

        # Simulace dat (tady by mohla být databázová operace)
        if action == 'fetch_table_data':
            table_data = [
                {'id': 1, 'name': 'Item 1', 'value': '100'},
                {'id': 2, 'name': 'Item 2', 'value': '200'},
            ]
            await self.send(json.dumps({'type': 'table_update', 'data': table_data}))
