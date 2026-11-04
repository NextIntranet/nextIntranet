"""Generic notes + attachments API.

Every request names its target via `target` (a key from `notes_registry`) and
`target_id`; list endpoints require both, detail endpoints check the target of the row.
"""
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from nextintranet_backend.models import Attachment, Note, NoteMention, User
from nextintranet_backend.notes_registry import get_target, target_key_for_model
from nextintranet_backend.serializers.note import (
    AttachmentSerializer,
    NoteSerializer,
    UserBriefSerializer,
)
from nextintranet_backend.services.mentions import parse_mentions

MAX_ATTACHMENT_BYTES = getattr(settings, 'NOTES_MAX_ATTACHMENT_BYTES', 50 * 1024 * 1024)


def _resolve_target(key: str, target_id: str):
    target = get_target(key)
    if target is None:
        raise ValidationError({'target': f"Unknown target '{key}'."})
    if not target_id:
        raise ValidationError({'target_id': 'This field is required.'})
    try:
        obj = target.model.objects.get(pk=target_id)
    except Exception:  # missing row or malformed pk
        raise NotFound('Target object not found.')
    return target, obj


def _target_of_row(row):
    model = row.content_type.model_class()
    target = get_target(target_key_for_model(model) or '')
    if target is None:
        raise NotFound()
    obj = model.objects.filter(pk=row.object_id).first()
    if obj is None:
        raise NotFound()
    return target, obj


def sync_mentions(note: Note) -> None:
    pairs = parse_mentions(note.body)
    note.mentions.all().delete()
    NoteMention.objects.bulk_create(
        [NoteMention(note=note, kind=kind, target_id=target_id) for kind, target_id in pairs]
    )


class _TargetScopedMixin:
    """List requires `?target=&target_id=`; detail access re-checks the row's target."""

    def _list_scope(self):
        params = self.request.query_params
        target, obj = _resolve_target(params.get('target'), params.get('target_id'))
        if not target.can_view(self.request.user, obj):
            raise PermissionDenied()
        return target, obj

    def _check_row(self, row, write: bool = False):
        target, obj = _target_of_row(row)
        check = target.can_write if write else target.can_view
        if not check(self.request.user, obj):
            raise PermissionDenied()


class NoteViewSet(_TargetScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NoteSerializer
    pagination_class = None
    parser_classes = [JSONParser]

    def get_queryset(self):
        queryset = Note.objects.select_related('author', 'content_type').prefetch_related(
            'mentions', 'attachments__uploaded_by', 'attachments__content_type'
        )
        if self.action == 'list':
            _, obj = self._list_scope()
            queryset = queryset.filter(
                content_type=ContentType.objects.get_for_model(obj), object_id=str(obj.pk)
            )
        return queryset.order_by('created_at')

    def get_object(self):
        note = super().get_object()
        self._check_row(note, write=self.request.method not in ('GET', 'HEAD', 'OPTIONS'))
        return note

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        target, obj = _resolve_target(request.data.get('target'), request.data.get('target_id'))
        if not target.can_write(request.user, obj):
            raise PermissionDenied()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.save(
            author=request.user,
            content_type=ContentType.objects.get_for_model(obj),
            object_id=str(obj.pk),
        )
        sync_mentions(note)
        return Response(self.get_serializer(note).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        note = self.get_object()
        if note.author_id != request.user.id:
            raise PermissionDenied('Only the author can edit a note.')
        serializer = self.get_serializer(note, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        note = serializer.save(edited_at=timezone.now())
        sync_mentions(note)
        return Response(self.get_serializer(note).data)

    def destroy(self, request, *args, **kwargs):
        note = self.get_object()
        if note.author_id != request.user.id and not request.user.is_superuser:
            raise PermissionDenied('Only the author or an administrator can delete a note.')
        for attachment in note.attachments.all():
            attachment.file.delete(save=False)
        note.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AttachmentViewSet(
    _TargetScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    serializer_class = AttachmentSerializer
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = Attachment.objects.select_related('uploaded_by', 'content_type')
        if self.action == 'list':
            _, obj = self._list_scope()
            queryset = queryset.filter(
                content_type=ContentType.objects.get_for_model(obj), object_id=str(obj.pk)
            )
            params = self.request.query_params
            if params.get('note'):
                queryset = queryset.filter(note_id=params['note'])
            elif params.get('standalone') in ('1', 'true'):
                queryset = queryset.filter(note__isnull=True)
            if params.get('kind'):
                queryset = queryset.filter(kind=params['kind'])
        return queryset.order_by('created_at')

    def get_object(self):
        attachment = super().get_object()
        self._check_row(attachment, write=self.request.method not in ('GET', 'HEAD', 'OPTIONS'))
        return attachment

    def create(self, request, *args, **kwargs):
        note = None
        note_id = request.data.get('note')
        if note_id:
            note = Note.objects.filter(pk=note_id).first()
            if note is None:
                raise ValidationError({'note': 'Note not found.'})
            if note.author_id != request.user.id:
                raise PermissionDenied('Only the note author can attach files to it.')
            target, obj = _target_of_row(note)
        else:
            target, obj = _resolve_target(request.data.get('target'), request.data.get('target_id'))
        if not target.can_write(request.user, obj):
            raise PermissionDenied()

        files = request.FILES.getlist('file')
        if not files:
            raise ValidationError({'file': 'At least one file is required.'})
        too_big = [f.name for f in files if f.size > MAX_ATTACHMENT_BYTES]
        if too_big:
            raise ValidationError({'file': f"Too large (max {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB): {', '.join(too_big)}"})

        caption = (request.data.get('caption') or '').strip()
        content_type = ContentType.objects.get_for_model(obj)
        created = []
        for upload in files:
            mime = getattr(upload, 'content_type', '') or ''
            created.append(
                Attachment.objects.create(
                    content_type=content_type,
                    object_id=str(obj.pk),
                    note=note,
                    module=target.module,
                    file=upload,
                    original_name=upload.name[:255],
                    mime_type=mime[:127],
                    size=upload.size,
                    kind=Attachment.guess_kind(mime, upload.name),
                    caption=caption[:500],
                    uploaded_by=request.user,
                )
            )
        serializer = self.get_serializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        attachment = self.get_object()
        if attachment.uploaded_by_id != request.user.id and not request.user.is_superuser:
            raise PermissionDenied('Only the uploader or an administrator can delete a file.')
        attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserLookupView(APIView):
    """Minimal user search for @mentions — readable by any signed-in user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        search = (request.query_params.get('search') or '').strip()
        ids = [value for value in request.query_params.get('ids', '').split(',') if value.isdigit()]
        queryset = User.objects.filter(is_active=True)
        if ids:
            queryset = queryset.filter(id__in=ids)
        elif search:
            for term in search.split():
                queryset = queryset.filter(
                    Q(username__icontains=term)
                    | Q(first_name__icontains=term)
                    | Q(last_name__icontains=term)
                    | Q(email__icontains=term)
                )
        users = queryset.order_by('first_name', 'last_name', 'username')[:20]
        return Response(UserBriefSerializer(users, many=True).data)
