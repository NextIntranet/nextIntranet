import uuid
from django.db import models
from django.contrib.auth import get_user_model
from django.utils.timezone import now
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

User = get_user_model()

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

    def save(self, *args, **kwargs):
        if not self.name:
            self.name = f"PrintList {now().strftime('%Y-%m-%d')} {self.owner.username}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

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

    def __str__(self):
        return f"{self.content_type} ({self.object_id})"


