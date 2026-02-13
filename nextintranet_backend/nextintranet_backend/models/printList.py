import os
import uuid
from django.db import models
from django.contrib.auth import get_user_model
from django.utils.timezone import now
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

User = get_user_model()


def print_file_upload_path(instance, filename):
    _, ext = os.path.splitext(filename or "")
    ext = ext or ".bin"
    date_path = now().strftime("%Y/%m")
    if getattr(instance, "kind", "uploaded") == "generated":
        return f"print_queue/tmp/{date_path}/{instance.id}{ext}"
    return f"print_queue/uploads/{date_path}/{instance.id}{ext}"

class PrintList(models.Model):
    """
    PrintList model represents a list of items to be printed, with metadata about its creation, ownership, and sharing.
    Attributes:
        id (UUIDField): Primary key, unique identifier for the print list.
        name (CharField): Name of the print list, default is an empty string.
        created_at (DateTimeField): Timestamp when the print list was created, automatically set on creation.
        printed_at (DateTimeField): Timestamp when the print list was printed, can be null or blank.
        owner (ForeignKey): Reference to the User who owns the print list.
        shared_with (ManyToManyField): Users with whom the print list is shared, can be blank.
        is_public (BooleanField): Indicates if the print list is public, default is True.
    Methods:
        save(*args, **kwargs): Overrides the save method to set a default name if none is provided.
        __str__(): Returns the name of the print list.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(
        max_length=255, 
        blank=True, 
        default=''
    )
    created_at = models.DateTimeField(auto_now_add=True)
    printed_at = models.DateTimeField(null=True, blank=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="print_lists")
    shared_with = models.ManyToManyField(User, blank=True, related_name="shared_print_lists")
    is_public = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.name:
            self.name = f"PrintList {now().strftime('%Y-%m-%d')} {self.owner}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class PrintFile(models.Model):
    """
    Represents a file uploaded directly into the print queue.
    """
    KIND_UPLOADED = "uploaded"
    KIND_GENERATED = "generated"
    KIND_CHOICES = [
        (KIND_UPLOADED, "Uploaded"),
        (KIND_GENERATED, "Generated"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="print_files")
    name = models.CharField(max_length=255)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_UPLOADED)
    file = models.FileField(upload_to=print_file_upload_path)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name

    @property
    def url(self):
        return self.file.url if self.file else None

class PrintItem(models.Model):
    """
    Represents an item in a print list, which can be a generic foreign key to any model.

    Attributes:
        id (UUIDField): The primary key for the PrintItem, generated automatically.
        print_list (ForeignKey): A reference to the PrintList this item belongs to.
        content_type (ForeignKey): A reference to the ContentType of the related object.
        object_id (UUIDField): The ID of the related object.
        content_object (GenericForeignKey): The related object itself.

    Example usage:

        print_list = PrintList.objects.first()
        warehouse_location = WarehouseLocation.objects.first()

        print_item = PrintItem.objects.create(
            print_list=print_list,
            content_type=ContentType.objects.get_for_model(WarehouseLocation),
            object_id=warehouse_location.id
        )
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    print_list = models.ForeignKey(PrintList, on_delete=models.CASCADE, related_name="items")

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.UUIDField()
    content_object = GenericForeignKey("content_type", "object_id")

    KIND_LABEL = "label"
    KIND_DOCUMENT = "document"
    KIND_CHOICES = [
        (KIND_LABEL, "Label"),
        (KIND_DOCUMENT, "Document"),
    ]

    STATUS_QUEUED = "queued"
    STATUS_PRINTING = "printing"
    STATUS_PRINTED = "printed"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_QUEUED, "Queued"),
        (STATUS_PRINTING, "Printing"),
        (STATUS_PRINTED, "Printed"),
        (STATUS_FAILED, "Failed"),
    ]

    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_LABEL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    payload = models.JSONField(blank=True, default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    printed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.content_type} ({self.object_id})"


class PrintRenderJob(models.Model):
    STATUS_QUEUED = "queued"
    STATUS_PROCESSING = "processing"
    STATUS_READY = "ready"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_QUEUED, "Queued"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_READY, "Ready"),
        (STATUS_FAILED, "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="print_render_jobs")
    print_list = models.ForeignKey(
        PrintList,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="render_jobs",
    )
    items = models.ManyToManyField(PrintItem, blank=True, related_name="render_jobs")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    payload = models.JSONField(blank=True, default=dict)
    file = models.ForeignKey(
        PrintFile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="render_jobs",
    )
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"RenderJob {self.id} ({self.status})"
