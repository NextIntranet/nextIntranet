from nextintranet_backend.models.userAccessPermission import UserAccessPermission

PRODUCTION_AREA = 'production'

# Header fields a production admin may still change once a BOM series is locked/finished.
ADMIN_EDITABLE_WHEN_CLOSED = frozenset({'name', 'description', 'planned_date'})


def is_production_admin(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return UserAccessPermission.objects.filter(
        user=user, area=PRODUCTION_AREA, level=UserAccessPermission.LEVEL_ADMIN
    ).exists()
