from django.apps import AppConfig


class NextintranetProductionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'nextintranet_production'
    verbose_name = 'Production Management'

    def ready(self) -> None:
        from . import mcp  # noqa: F401 — ensure MCP toolsets load before mcp_server.init()
