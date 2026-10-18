"""Generic notes and file attachments that can hang off any registered object.

Targets are addressed by ContentType + a string object id (UUID or int primary keys);
which models may be targeted is decided by `nextintranet_backend.notes_registry`.
"""
import mimetypes

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import models

from . import NIModel
from ..utils.uploads import upload_key


class Note(NIModel):
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=64, db_index=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notes',
    )
    body = models.TextField(help_text='Markdown text; mentions are stored as [label](mention:kind/id) links.')
    updated_at = models.DateTimeField(auto_now=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at']
        indexes = [models.Index(fields=['content_type', 'object_id', 'created_at'])]

    def __str__(self):
        return f'Note {self.id} on {self.content_type.model}:{self.object_id}'


class NoteMention(models.Model):
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name='mentions')
    kind = models.CharField(max_length=32)
    target_id = models.CharField(max_length=64)

    class Meta:
        unique_together = ('note', 'kind', 'target_id')
        indexes = [models.Index(fields=['kind', 'target_id'])]

    def __str__(self):
        return f'{self.kind}:{self.target_id}'


def attachment_upload_path(instance, filename: str) -> str:
    return upload_key(instance.module or 'attachments', filename)


class Attachment(NIModel):
    KIND_PHOTO = 'photo'
    KIND_DOCUMENT = 'document'
    KIND_OTHER = 'other'
    KIND_CHOICES = [
        (KIND_PHOTO, 'Photo'),
        (KIND_DOCUMENT, 'Document'),
        (KIND_OTHER, 'Other'),
    ]

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=64, db_index=True)
    note = models.ForeignKey(Note, on_delete=models.CASCADE, null=True, blank=True, related_name='attachments')
    # S3 key prefix (`uploads/<module>/...`), taken from the target registry.
    module = models.CharField(max_length=64, blank=True)
    file = models.FileField(upload_to=attachment_upload_path, max_length=512)
    original_name = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=127, blank=True)
    size = models.BigIntegerField(default=0)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default=KIND_OTHER)
    caption = models.CharField(max_length=500, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attachments',
    )

    class Meta:
        ordering = ['created_at']
        indexes = [models.Index(fields=['content_type', 'object_id', 'created_at'])]

    def __str__(self):
        return self.original_name or str(self.id)

    @staticmethod
    def guess_kind(mime_type: str, filename: str = '') -> str:
        mime = mime_type or mimetypes.guess_type(filename or '')[0] or ''
        if mime.startswith('image/'):
            return Attachment.KIND_PHOTO
        if mime.startswith('text/') or mime in {
            'application/pdf',
            'application/xml',
            'application/json',
            'application/zip',
        } or mime.startswith('application/vnd.'):
            return Attachment.KIND_DOCUMENT
        return Attachment.KIND_OTHER
