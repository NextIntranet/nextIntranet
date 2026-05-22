from django.contrib.auth.password_validation import validate_password
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


SELF_PROFILE_FIELDS = frozenset({'first_name', 'last_name', 'email'})


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
    )
    new_password_confirm = serializers.CharField(write_only=True, required=True)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError(
                {'new_password_confirm': 'Passwords do not match.'},
            )
        return attrs


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

    def _is_self_edit(self, instance):
        request = self.context.get('request')
        return (
            request is not None
            and getattr(request, 'user', None)
            and request.user.is_authenticated
            and request.user.pk == instance.pk
        )

    def update(self, instance, validated_data):
        permissions = validated_data.pop('access_permissions', None)
        password = validated_data.pop('password', None)

        if self._is_self_edit(instance):
            validated_data = {
                key: value
                for key, value in validated_data.items()
                if key in SELF_PROFILE_FIELDS
            }
            permissions = None
            password = None

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        self._sync_access_permissions(instance, permissions)
        return instance
