from rest_framework import serializers

from nextintranet_backend.models.user import User
from nextintranet_backend.models.userSettings import UserSetting


class UserSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSetting
        fields = '__all__'

class UserSerializer(serializers.ModelSerializer):
    settings = UserSettingSerializer(many=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'settings']

