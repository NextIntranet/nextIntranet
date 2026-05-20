import asyncio
import base64
import json
import os
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

from aiohttp import ClientSession, web, WSMsgType

try:
    import serial
    from serial.tools import list_ports
except Exception:  # pragma: no cover - optional dependency
    serial = None
    list_ports = None

try:
    import cups
except Exception:  # pragma: no cover - optional dependency
    cups = None


@dataclass(frozen=True)
class AgentConfig:
    agent_id: str
    token: Optional[str]
    allowed_origins: set
    station_id: Optional[str]
    host: str
    port: int


def _load_config() -> AgentConfig:
    allowed_origins = os.getenv("NEXT_AGENT_ALLOWED_ORIGINS", "")
    origins = {origin.strip() for origin in allowed_origins.split(",") if origin.strip()}
    station_id = os.getenv("NEXT_AGENT_STATION_ID")
    return AgentConfig(
        agent_id=os.getenv("NEXT_AGENT_ID", "agent-local"),
        token=os.getenv("NEXT_AGENT_TOKEN") or None,
        allowed_origins=origins,
        station_id=station_id or None,
        host=os.getenv("NEXT_AGENT_HOST", "0.0.0.0"),
        port=int(os.getenv("NEXT_AGENT_PORT", "9101")),
    )


def _normalize_event(event: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(event or {})
    payload.setdefault("id", str(uuid.uuid4()))
    payload.setdefault("type", "event")
    payload.setdefault("ts", int(time.time() * 1000))
    payload.setdefault("payload", {})
    return payload


class EventHub:
    def __init__(self, station_id: Optional[str] = None) -> None:
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._station_id = station_id
        self._groups: Dict[str, set] = {
            "broadcast": set(),
        }

    @staticmethod
    def _group_name(station_id: Optional[str]) -> str:
        if not station_id:
            return "broadcast"
        return f"station-{station_id}"

    async def register(self, ws: web.WebSocketResponse, station_id: Optional[str]) -> str:
        group = self._group_name(station_id)
        self._groups.setdefault(group, set()).add(ws)
        return group

    async def unregister(self, ws: web.WebSocketResponse, group: str) -> None:
        clients = self._groups.get(group)
        if not clients:
            return
        clients.discard(ws)

    async def broadcast(self, event: Dict[str, Any], station_id: Optional[str] = None) -> None:
        normalized = _normalize_event(event)
        group = self._group_name(station_id or self._station_id)
        targets = [group]
        if group != "broadcast":
            targets.append("broadcast")

        for target in targets:
            for ws in list(self._groups.get(target, set())):
                if ws.closed:
                    continue
                await ws.send_json(normalized)

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def publish(self, event: Dict[str, Any], station_id: Optional[str] = None) -> None:
        if not self._loop:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(event, station_id), self._loop)


class SerialConnection:
    def __init__(
        self,
        device_id: str,
        port: Any,
        path: str,
        baudrate: int,
        mode: str,
        hub: EventHub,
        agent_id: str,
        station_id: Optional[str],
    ) -> None:
        self.device_id = device_id
        self.port = port
        self.path = path
        self.baudrate = baudrate
        self.mode = mode
        self.hub = hub
        self.agent_id = agent_id
        self.station_id = station_id
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._reader_loop, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def close(self) -> None:
        self._stop.set()
        try:
            self.port.close()
        except Exception:
            pass

    def _reader_loop(self) -> None:
        while not self._stop.is_set():
            try:
                data = self.port.readline()
            except Exception:
                break

            if not data:
                continue

            ts = int(time.time() * 1000)
            source = f"agent:{self.agent_id}:serial:{self.path}"
            self.hub.publish(
                {
                    "type": "serial.data",
                    "deviceId": self.device_id,
                    "payload": {
                        "bytesBase64": base64.b64encode(data).decode("ascii"),
                        "ts": ts,
                        "source": source,
                    },
                },
                station_id=self.station_id,
            )

            if self.mode == "scanner":
                text = data.decode("utf-8", errors="replace").strip()
                if not text:
                    continue
                self.hub.publish(
                    {
                        "type": "scanner.data",
                        "deviceId": self.device_id,
                        "payload": {
                            "text": text,
                            "ts": ts,
                            "source": source,
                        },
                    },
                    station_id=self.station_id,
                )


class SerialManager:
    def __init__(self, hub: EventHub, agent_id: str, station_id: Optional[str]) -> None:
        self._hub = hub
        self._agent_id = agent_id
        self._station_id = station_id
        self._connections: Dict[str, SerialConnection] = {}

    def list_ports(self) -> list:
        if not list_ports:
            return []
        ports = []
        for entry in list_ports.comports():
            ports.append(
                {
                    "path": entry.device,
                    "description": entry.description,
                    "hwid": entry.hwid,
                    "manufacturer": entry.manufacturer,
                    "serialNumber": entry.serial_number,
                }
            )
        return ports

    def open_port(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not serial:
            raise RuntimeError("pyserial is not available")

        path = payload.get("path")
        if not path:
            raise ValueError("Missing serial path")

        baudrate = int(payload.get("baudrate", 9600))
        mode = payload.get("mode", "scanner")

        try:
            port = serial.Serial(path, baudrate=baudrate, timeout=1)
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc
        device_id = str(uuid.uuid4())
        connection = SerialConnection(
            device_id=device_id,
            port=port,
            path=path,
            baudrate=baudrate,
            mode=mode,
            hub=self._hub,
            agent_id=self._agent_id,
            station_id=self._station_id,
        )
        self._connections[device_id] = connection
        connection.start()
        return {
            "deviceId": device_id,
            "path": path,
            "baudrate": baudrate,
            "mode": mode,
        }

    def write(self, payload: Dict[str, Any]) -> None:
        device_id = payload.get("deviceId")
        if not device_id:
            raise ValueError("Missing deviceId")
        connection = self._connections.get(device_id)
        if not connection:
            raise ValueError("Unknown deviceId")

        if payload.get("dataBase64"):
            data = base64.b64decode(payload["dataBase64"])
        else:
            text = payload.get("text", "")
            if payload.get("appendNewline", False):
                text += "\n"
            data = text.encode(payload.get("encoding", "utf-8"))

        try:
            connection.port.write(data)
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc

    def close(self, payload: Dict[str, Any]) -> None:
        device_id = payload.get("deviceId")
        if not device_id:
            raise ValueError("Missing deviceId")
        connection = self._connections.pop(device_id, None)
        if not connection:
            raise ValueError("Unknown deviceId")
        connection.close()


class PrintManager:
    def __init__(self, hub: EventHub, agent_id: str, station_id: Optional[str]) -> None:
        self._hub = hub
        self._agent_id = agent_id
        self._station_id = station_id

    def list_printers(self) -> list:
        if not cups:
            return []
        conn = cups.Connection()
        printers = conn.getPrinters() or {}
        default_printer = None
        try:
            default_printer = conn.getDefault()
        except Exception:
            default_printer = None

        result = []
        for name, meta in printers.items():
            result.append(
                {
                    "name": name,
                    "info": meta.get("printer-info"),
                    "location": meta.get("printer-location"),
                    "isDefault": name == default_printer,
                }
            )
        return result

    async def submit_job(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not cups:
            raise RuntimeError("pycups is not available")

        printer = payload.get("printer")
        if not printer:
            raise ValueError("Missing printer")

        file_bytes = None
        if payload.get("dataBase64"):
            file_bytes = base64.b64decode(payload["dataBase64"])
        elif payload.get("fileUrl"):
            file_bytes = await self._fetch_file(payload["fileUrl"], payload.get("headers"))
        else:
            raise ValueError("Missing dataBase64 or fileUrl")

        options = payload.get("options") or {}
        if payload.get("format") == "raw":
            options["raw"] = "true"

        job_name = payload.get("title") or f"NextIntranet {int(time.time())}"

        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as temp:
            temp.write(file_bytes)
            temp_path = temp.name

        conn = cups.Connection()
        try:
            job_id = conn.printFile(printer, temp_path, job_name, options)
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

        self._hub.publish(
            {
                "type": "print.job",
                "payload": {
                    "jobId": str(job_id),
                    "state": "submitted",
                    "ts": int(time.time() * 1000),
                },
            },
            station_id=self._station_id,
        )

        return {"jobId": str(job_id)}

    async def _fetch_file(self, url: str, headers: Optional[Dict[str, str]]) -> bytes:
        async with ClientSession() as session:
            async with session.get(url, headers=headers or {}) as response:
                if response.status >= 400:
                    raise ValueError(f"Failed to fetch file: {response.status}")
                return await response.read()


def _extract_token_from_request(request: web.Request) -> Optional[str]:
    token = request.headers.get("X-Agent-Token")
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Agent "):
        return auth.split(" ", 1)[1]
    return None


def _authorize_request(request: web.Request, config: AgentConfig) -> bool:
    if not config.token:
        return True
    return _extract_token_from_request(request) == config.token


def _authorize_ws(request: web.Request, config: AgentConfig) -> bool:
    if not config.token:
        return True
    token = request.query.get("token")
    if token == config.token:
        return True
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Agent ") and auth.split(" ", 1)[1] == config.token:
        return True
    return False


def _origin_allowed(origin: Optional[str], config: AgentConfig) -> bool:
    if not origin:
        return True
    if not config.allowed_origins:
        return False
    return origin in config.allowed_origins


async def _handle_status(request: web.Request) -> web.Response:
    config: AgentConfig = request.app["config"]
    start_ts: float = request.app["start_ts"]
    payload = {
        "agentId": config.agent_id,
        "version": "1.0.0",
        "capabilities": ["serial", "scanner", "print"],
        "stationId": config.station_id,
        "uptimeSec": int(time.time() - start_ts),
        "ts": int(time.time() * 1000),
    }
    return web.json_response(payload)


async def _handle_serial_ports(request: web.Request) -> web.Response:
    manager: SerialManager = request.app["serial_manager"]
    return web.json_response(manager.list_ports())


async def _handle_serial_open(request: web.Request) -> web.Response:
    manager: SerialManager = request.app["serial_manager"]
    payload = await request.json()
    try:
        data = manager.open_port(payload)
    except (ValueError, RuntimeError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
    return web.json_response(data)


async def _handle_serial_write(request: web.Request) -> web.Response:
    manager: SerialManager = request.app["serial_manager"]
    payload = await request.json()
    try:
        manager.write(payload)
    except (ValueError, RuntimeError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
    return web.json_response({"ok": True})


async def _handle_serial_close(request: web.Request) -> web.Response:
    manager: SerialManager = request.app["serial_manager"]
    payload = await request.json()
    try:
        manager.close(payload)
    except (ValueError, RuntimeError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
    return web.json_response({"ok": True})


async def _handle_printers(request: web.Request) -> web.Response:
    manager: PrintManager = request.app["print_manager"]
    return web.json_response(manager.list_printers())


async def _handle_print_job(request: web.Request) -> web.Response:
    manager: PrintManager = request.app["print_manager"]
    payload = await request.json()
    try:
        result = await manager.submit_job(payload)
    except (ValueError, RuntimeError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
    return web.json_response(result)


async def _handle_ws_events(request: web.Request) -> web.StreamResponse:
    config: AgentConfig = request.app["config"]
    if not _authorize_ws(request, config):
        return web.Response(status=401)

    origin = request.headers.get("Origin")
    if not _origin_allowed(origin, config):
        return web.Response(status=403)

    hub: EventHub = request.app["event_hub"]
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    group = await hub.register(ws, None)

    async for msg in ws:
        if msg.type != WSMsgType.TEXT:
            continue
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            continue
        station_id = payload.get("stationId") or config.station_id
        await hub.broadcast(payload, station_id=station_id)

    await hub.unregister(ws, group)
    return ws


async def _handle_ws_station(request: web.Request) -> web.StreamResponse:
    config: AgentConfig = request.app["config"]
    if not _authorize_ws(request, config):
        return web.Response(status=401)

    origin = request.headers.get("Origin")
    if not _origin_allowed(origin, config):
        return web.Response(status=403)

    hub: EventHub = request.app["event_hub"]
    station_id = request.match_info.get("station_id")

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    group = await hub.register(ws, station_id)

    async for msg in ws:
        if msg.type != WSMsgType.TEXT:
            continue
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            continue
        await hub.broadcast(payload, station_id=station_id)

    await hub.unregister(ws, group)
    return ws


def _make_cors_middleware(config: AgentConfig):
    @web.middleware
    async def cors_middleware(request: web.Request, handler):
        if request.method == "OPTIONS":
            response = web.Response(status=204)
        else:
            response = await handler(request)

        origin = request.headers.get("Origin")
        if _origin_allowed(origin, config) and origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, X-Agent-Token, Authorization"
            )
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"

        return response

    return cors_middleware


def _make_auth_middleware(config: AgentConfig):
    @web.middleware
    async def auth_middleware(request: web.Request, handler):
        if request.path.startswith("/ws/"):
            return await handler(request)
        if not _authorize_request(request, config):
            return web.json_response({"error": "Unauthorized"}, status=401)
        return await handler(request)

    return auth_middleware


def create_app() -> web.Application:
    config = _load_config()
    hub = EventHub(station_id=config.station_id)

    app = web.Application(middlewares=[_make_cors_middleware(config), _make_auth_middleware(config)])
    app["config"] = config
    app["event_hub"] = hub
    app["serial_manager"] = SerialManager(hub, config.agent_id, config.station_id)
    app["print_manager"] = PrintManager(hub, config.agent_id, config.station_id)
    app["start_ts"] = time.time()

    app.router.add_get("/v1/status", _handle_status)
    app.router.add_get("/v1/serial/ports", _handle_serial_ports)
    app.router.add_post("/v1/serial/open", _handle_serial_open)
    app.router.add_post("/v1/serial/write", _handle_serial_write)
    app.router.add_post("/v1/serial/close", _handle_serial_close)
    app.router.add_get("/v1/print/printers", _handle_printers)
    app.router.add_post("/v1/print/job", _handle_print_job)

    app.router.add_get("/ws/events/", _handle_ws_events)
    app.router.add_get("/ws/station/{station_id}/", _handle_ws_station)

    async def _on_startup(app: web.Application) -> None:
        hub.set_loop(asyncio.get_running_loop())

    app.on_startup.append(_on_startup)

    return app


def main() -> None:
    config = _load_config()
    app = create_app()
    web.run_app(app, host=config.host, port=config.port)


if __name__ == "__main__":
    main()
