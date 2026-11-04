from rest_framework import serializers

from nextintranet_backend.models import Attachment, Note
from nextintranet_backend.notes_registry import target_key_for_model


def user_display_name(user) -> str:
    if user is None:
        return ''
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full_name or user.username


class UserBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    display_name = serializers.SerializerMethodField()

    def get_display_name(self, obj) -> str:
        return user_display_name(obj)


def _target_key(obj) -> str | None:
    return target_key_for_model(obj.content_type.model_class())


def _is_superuser(context) -> bool:
    request = context.get('request')
    return bool(request and request.user and request.user.is_superuser)


def _is_current_user(context, user_id) -> bool:
    request = context.get('request')
    return bool(request and user_id is not None and request.user.id == user_id)


class AttachmentSerializer(serializers.ModelSerializer):
    target = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    uploaded_by = UserBriefSerializer(read_only=True)
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            'id',
            'target',
            'object_id',
            'note',
            'file_url',
            'original_name',
            'mime_type',
            'size',
            'kind',
            'caption',
            'uploaded_by',
            'created_at',
            'can_delete',
        ]
        read_only_fields = [f for f in fields if f != 'caption']

    def get_target(self, obj) -> str | None:
        return _target_key(obj)

    def get_file_url(self, obj) -> str | None:
        try:
            return obj.file.url if obj.file else None
        except Exception:
            return None

    def get_can_delete(self, obj) -> bool:
        return _is_superuser(self.context) or _is_current_user(self.context, obj.uploaded_by_id)


class NoteMentionSerializer(serializers.Serializer):
    kind = serializers.CharField()
    target_id = serializers.CharField()


class NoteSerializer(serializers.ModelSerializer):
    target = serializers.SerializerMethodField()
    author = UserBriefSerializer(read_only=True)
    mentions = NoteMentionSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = [
            'id',
            'target',
            'object_id',
            'author',
            'body',
            'created_at',
            'updated_at',
            'edited_at',
            'mentions',
            'attachments',
            'can_edit',
            'can_delete',
        ]
        read_only_fields = [f for f in fields if f != 'body']

    def validate_body(self, value: str) -> str:
        if not (value or '').strip():
            raise serializers.ValidationError('Note cannot be empty.')
        return value

    def get_target(self, obj) -> str | None:
        return _target_key(obj)

    def get_can_edit(self, obj) -> bool:
        return _is_current_user(self.context, obj.author_id)

    def get_can_delete(self, obj) -> bool:
        return _is_superuser(self.context) or _is_current_user(self.context, obj.author_id)
