from rest_framework.routers import DefaultRouter


class NoFormatSuffixRouter(DefaultRouter):
    """
    Router that doesn't use format suffixes to avoid duplicate converter registration
    in Django 6.0 when multiple routers are included.
    """
    include_format_suffixes = False
