from rest_framework.permissions import BasePermission, SAFE_METHODS


LEVEL_ORDER = {
    'hidden': 0,
    'guest': 1,
    'read': 2,
    'write': 3,
    'admin': 4
}


class AreaAccessPermission(BasePermission):
    def has_permission(self, request, view):
        required_permission_area = getattr(view, 'required_permission_area', None)
        if not required_permission_area:
            return True

        if not request.user or not request.user.is_authenticated:
            return False

        if getattr(request.user, 'is_superuser', False):
            return True

        required_level = getattr(view, 'required_level', None)
        if required_level is None:
            required_level = 'read' if request.method in SAFE_METHODS else 'write'
        elif request.method not in SAFE_METHODS:
            required_level = self.ensure_write_requirement(required_level)
        user_level = self.get_user_level(request.user, required_permission_area)

        # Pokud uživatel nemá pro danou oblast přiřazené žádné oprávnění,
        # nesmí se k ní vůbec dostat.
        if user_level is None:
            return False

        if user_level == 'hidden':
            return False

        return LEVEL_ORDER.get(user_level, 0) >= LEVEL_ORDER.get(required_level, 0)

    def get_user_level(self, user, area):
        permission = user.access_permissions.filter(area=area).first()
        if not permission:
            return None
        return permission.level

    def ensure_write_requirement(self, required_level):
        if LEVEL_ORDER.get(required_level, 0) < LEVEL_ORDER.get('write', 0):
            return 'write'
        return required_level
