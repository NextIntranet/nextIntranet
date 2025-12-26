from django.apps import AppConfig


class NextintranetWarehouseConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'nextintranet_warehouse'

    def ready(self) -> None:
        from . import signals  # noqa: F401
