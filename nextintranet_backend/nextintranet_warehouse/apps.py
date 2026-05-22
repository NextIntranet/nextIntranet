from django.apps import AppConfig


class NextintranetWarehouseConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'nextintranet_warehouse'

    def ready(self) -> None:
        from . import signals  # noqa: F401
        from . import mcp  # noqa: F401 — ensure MCP toolsets load before mcp_server.init()
