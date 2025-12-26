from rest_framework import serializers

from nextintranet_backend.models.user import User
from nextintranet_backend.models.userAccessPermission import UserAccessPermission
from nextintranet_backend.models.userSettings import UserSetting


class UserSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSetting
        fields = '__all__'


class UserAccessPermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAccessPermission
        fields = ['id', 'area', 'level']


class UserSerializer(serializers.ModelSerializer):
    settings = UserSettingSerializer(many=False)
    access_permissions = UserAccessPermissionSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'is_superuser',
            'is_staff',
            'is_active',
            'last_login',
            'date_joined',
            'access_permissions',
            'settings',
        ]


class UserAdminSerializer(serializers.ModelSerializer):
    access_permissions = UserAccessPermissionSerializer(many=True, required=False)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'is_active',
            'is_staff',
            'is_superuser',
            'access_permissions',
            'password',
        ]
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
        }

    def _sync_access_permissions(self, user, permissions):
        if permissions is None:
            return
        user.access_permissions.all().delete()
        for permission in permissions:
            UserAccessPermission.objects.create(
                user=user,
                area=permission.get('area', '').strip(),
                level=permission.get('level', 'read'),
            )

    def create(self, validated_data):
        permissions = validated_data.pop('access_permissions', None)
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        self._sync_access_permissions(user, permissions)
        return user

    def update(self, instance, validated_data):
        permissions = validated_data.pop('access_permissions', None)
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        self._sync_access_permissions(instance, permissions)
        return instance
