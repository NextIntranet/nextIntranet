from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from mptt.models import MPTTModel, TreeForeignKey
from colorfield.fields import ColorField
import uuid

from nextintranet_backend.models import NIModel
from django.urls import reverse

class Component(NIModel):
    # Základní informace o součástce
    UNIT_TYPE_CHOICES = (
        ('int', _('Integer')),
        ('float', _('Float')),
    )    
    name = models.CharField(max_length=255)
    
    # Detailní informace
    description = models.TextField(help_text=_('Markdown description'), blank=True, null=True)
    category = models.ForeignKey('Category', on_delete=models.SET_NULL, null=True, related_name='components', verbose_name=_('Category'))
    tags = models.ManyToManyField('Tag', blank=True, verbose_name=_('Tags'))
    unit_type = models.CharField(max_length=10, choices=UNIT_TYPE_CHOICES, default='int', help_text=_('Defines whether the component is tracked in integer or float quantities (e.g., pieces vs meters).'))
    selling_price = models.FloatField(blank=True, null=True, help_text=_('Selling price per unit for external sales.'))
    internal_price = models.FloatField(blank=True, null=True, help_text=_('Price per unit for internal use.'))
    primary_image = models.ForeignKey('Document', on_delete=models.PROTECT, null=True, blank=True, related_name='primary_for', help_text=_('Primary image for the component.'))

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse('component-detail', args=[str(self.id)])

    # def save(self, *args, **kwargs):
    #     # Track changes in selling and internal prices
    #     if self.pk:
    #         original = Component.objects.get(pk=self.pk)
    #         if original.selling_price != self.selling_price:
    #             self.track_price_history('selling', self.selling_price)
    #         if original.internal_price != self.internal_price:
    #             self.track_price_history('internal', self.internal_price)
    #     super().save(*args, **kwargs)
    
    @property
    def suppliers_list(self):
        return Supplier.objects.filter(component_relations__component=self)

    @property
    def count(self):
        # Calculate current quantity of the component across all batches, excluding reservations
        total_quantity = sum(packet.count for packet in self.packets.all())
        reserved_quantity = self.reservations.aggregate(total_reserved=models.Sum('quantity'))['total_reserved'] or 0
        return total_quantity - reserved_quantity

    def count_warehouse(self, include_reservations=True):
        # Calculate current quantity of the component across all batches with option to include reservations
        total_quantity = sum(packet.count for packet in self.packets.all())
        if not include_reservations:
            reserved_quantity = self.reservations.aggregate(total_reserved=models.Sum('quantity'))['total_reserved'] or 0
            return total_quantity - reserved_quantity
        return total_quantity

    def min_purchase_price(self):
        return StockOperation.objects.filter(packet__component=self, operation_type='purchase').aggregate(models.Min('unit_price'))['unit_price__min']

    def max_purchase_price(self):
        return StockOperation.objects.filter(packet__component=self, operation_type='purchase').aggregate(models.Max('unit_price'))['unit_price__max']

    def average_purchase_price(self):
        return StockOperation.objects.filter(packet__component=self, operation_type='purchase').aggregate(models.Avg('unit_price'))['unit_price__avg']

    def last_purchase_price(self):
        last_purchase = StockOperation.objects.filter(packet__component=self, operation_type='purchase').order_by('-timestamp').first()
        return last_purchase.unit_price if last_purchase else None

    def track_price_history(self, price_type, new_price):
        if new_price is not None:
            PriceHistory.objects.create(component=self, price_type=price_type, price=new_price)

    def get_local_packets(self, warehouse):
        return self.packets.filter(warehouse__in=warehouse.get_descendants(include_self=True))


class PriceHistory(NIModel):
    PRICE_TYPE_CHOICES = (
        ('selling', _('Selling')),
        ('internal', _('Internal')),
    )
    component = models.ForeignKey(Component, on_delete=models.CASCADE, related_name='price_histories', verbose_name=_('Component'))
    price_type = models.CharField(max_length=10, choices=PRICE_TYPE_CHOICES, verbose_name=_('Price type'))
    price = models.FloatField(verbose_name=_('Price'))
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name=_('Timestamp'))

    def __str__(self):
        return f"{self.component.name} - {self.price_type} - {self.price}"

class Identifier(NIModel):
    # Model pro uchovávání identifikátorů, které mohou patřit k různým typům objektů
    identifier = models.CharField(max_length=255, unique=True, verbose_name=_('Identifier'))
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')

    def __str__(self):
        return self.identifier


class ParameterType(NIModel):
    # Definice typu parametru
    name = models.CharField(max_length=100, unique=True, verbose_name=_('Parameter name'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Description'))

    def __str__(self):
        return self.name


class ComponentParameter(NIModel):
    # Parametr komponenty
    component = models.ForeignKey(Component, on_delete=models.CASCADE, related_name='parameters', verbose_name=_('Component'))
    parameter_type = models.ForeignKey(ParameterType, on_delete=models.CASCADE, related_name='component_parameters', verbose_name=_('Parameter type'))
    value = models.CharField(max_length=255, verbose_name=_('Value'))

    def __str__(self):
        return f"{self.parameter_type.name}: {self.value}"


class Document(NIModel):
    DOCUMENT_TYPE_CHOICES = (
        ('datasheet', _('Datasheet')),
        ('manual', _('Manual')),
        ('specification', _('Specification')),
        ('application_note', _('Application Note')),
        ('drawing', _('Drawing')),
        ('certificate', _('Certificate')),
        ('image', _('Image')),
        ('other', _('Other')),
        ('undefined', _('Undefined')),
    )
    component = models.ForeignKey(Component, on_delete=models.CASCADE, related_name='documents', verbose_name=_('Component'))
    name = models.CharField(max_length=255, verbose_name=_('Name'), blank=True, null=True)
    doc_type = models.CharField(max_length=50, choices=DOCUMENT_TYPE_CHOICES, verbose_name=_('Document type'), default='undefined')
    file = models.FileField(upload_to='documents/', blank=True, null=True, verbose_name=_('File'))
    url = models.URLField(blank=True, null=True, help_text=_('URL of the document if hosted externally.'))

    def __str__(self):
        return self.name

    @property
    def get_url(self):
        return self.file.url if self.file else self.url


class Supplier(NIModel):
    # Informace o dodavateli
    name = models.CharField(max_length=255, verbose_name=_('Name'))
    contact_info = models.TextField(blank=True, null=True, verbose_name=_('Contact information'))  # Kontakt na dodavatele
    website = models.URLField(blank=True, null=True, verbose_name=_('Website'))
    link_template = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text=_('Template for generating the product link in the supplier\'s e-shop. Use {symbol} as a placeholder for the component symbol.'),
        verbose_name=_('Link template')
    )  # Šablona pro generování odkazu na e-shop
    min_order_quantity = models.PositiveIntegerField(default=1, help_text=_('Minimum order quantity for the supplier, e.g., items sold in packs of 10.'), verbose_name=_('Minimum order quantity'))

    def __str__(self):
        return self.name


class SupplierRelation(NIModel):
    # Relace mezi komponentou a dodavatelem
    component = models.ForeignKey(Component, on_delete=models.CASCADE, related_name='suppliers', verbose_name=_('Item'))
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='component_relations', verbose_name=_('Supplier'), help_text=_('Supplier of the item.'))
    symbol = models.CharField(max_length=100, verbose_name=_('Supplier symbol'), help_text=_('Supplier\'s symbol (order code) for the item.'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Description'), help_text=_('Description of the component in the supplier\'s e-shop.'))
    custom_url = models.URLField(blank=True, null=True, verbose_name=_('Custom URL'), help_text=_('Custom URL for the component in the supplier\'s e-shop. Use this field to override the link template in suppliers profile.'))

    api_data = models.JSONField(blank=True, null=True, verbose_name=_('api_data'))

    @property
    def url(self):
        if self.custom_url:
            return self.custom_url
        if self.supplier.link_template:
            return self.supplier.link_template.replace("{symbol}", self.symbol)
        return None

    def __str__(self):
        return f"{self.supplier.name} - {self.component.name}"  

    def get_edit_url(self):
        return reverse('supplier-relation-edit', kwargs={'uuid': self.id})
    def get_delete_url(self):
        return reverse('supplier-relation-delete', kwargs={'uuid': self.id})



class Tag(NIModel):
    # Tag pro kategorizaci součástek
    name = models.CharField(max_length=50, unique=True, verbose_name=_('Name'))
    
    def __str__(self):
        return self.name



class Packet(NIModel):
    component = models.ForeignKey(Component, on_delete=models.CASCADE, related_name='packets', verbose_name=_('Component'))
    location = models.ForeignKey(
        'Warehouse', 
        on_delete=models.CASCADE, 
        related_name='packets', 
        verbose_name=_('Packet location'), 
        help_text=_('Location of the batch in the warehouse.'),
        limit_choices_to={'can_store_items': True}
    )
    description = models.TextField(blank=True, null=True, verbose_name=_('Description'))
    is_trackable = models.BooleanField(default=False, help_text=_('Indicates if the component is trackable by individual pieces.'), verbose_name=_('Is trackable'))
    date_added = models.DateTimeField(auto_now_add=True, verbose_name=_('Date added'))

    last_operation = models.OneToOneField('StockOperation', on_delete=models.SET_NULL, blank=True, null=True, related_name='last_operation', verbose_name=_('Last operation'))

    

    def __str__(self):
        return f"{self.component.name} - {self.location.name}"

    def save(self, *args, **kwargs):
        if not self.location.can_store_items:
            raise ValueError(_('The selected warehouse cannot store items.'))
        super().save(*args, **kwargs)

    @property
    def count(self):
        # Calculate current quantity of the batch based on stock operations
        return StockOperation.objects.filter(packet=self).aggregate(total_quantity=models.Sum('quantity'))['total_quantity'] or 0

    def get_absolute_url(self):
        return self.component.get_absolute_url()+"?packet="+str(self.pk)






class StockOperation(NIModel):
    # Operace se skladovými zásobami
    OPERATION_TYPE = (
        ('add', _('Add')),
        ('remove', _('Remove')),
        ('adjust', _('Adjust')),
        ('trans_in', _('Transfer in')),
        ('trans_out', _('Transfer out')),
        ('inventory', _('Inventory')),
        ('service', _('Service withdrawal')),
        ('buy', _('Buy')),
        ('sell', _('Sell')),
    )

    packet = models.ForeignKey(Packet, on_delete=models.PROTECT, related_name='operations', verbose_name=_('Packet'))
    previous_operation = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True, related_name='next_operation', verbose_name=_('Previous operation. Null for the first operation in the batch.'))
    operation_type = models.CharField(max_length=10, choices=OPERATION_TYPE, verbose_name=_('Operation type'))
    quantity = models.FloatField(verbose_name=_('Quantity'))
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name=_('Timestamp'))
    relative_quantity = models.BooleanField(default=True, help_text=_('Indicates if the quantity is relative (e.g., added or removed) or an absolute value after the operation.'), verbose_name=_('Relative quantity'))
    unit_price = models.FloatField(blank=True, null=True, help_text=_('Unit price for the operation, used for FIFO tracking.'), verbose_name=_('Unit price'))



    @property
    def next_operation(self):
        return self.next_operation

    @property
    def operation_price(self):
        return self.quantity * self.unit_price

    def __str__(self):
        return f"{self.operation_type} - {self.packet.component.name} - {self.quantity} units"

    @classmethod
    def min_purchase_price(cls):
        return cls.objects.filter(operation_type='purchase').aggregate(models.Min('unit_price'))['unit_price__min']

    @classmethod
    def max_purchase_price(cls):
        return cls.objects.filter(operation_type='purchase').aggregate(models.Max('unit_price'))['unit_price__max']

    @classmethod
    def average_purchase_price(cls):
        return cls.objects.filter(operation_type='purchase').aggregate(models.Avg('unit_price'))['unit_price__avg']

    @classmethod
    def last_purchase_price(cls):
        last_purchase = cls.objects.filter(operation_type='purchase').order_by('-timestamp').first()
        return last_purchase.unit_price if last_purchase else None

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.packet:
            self.packet.last_operation = self
            self.packet.save()


class Reservation(NIModel):
    # Rezervace součástek
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    component = models.ForeignKey(Component, on_delete=models.CASCADE, related_name='reservations', verbose_name=_('Component'))
    quantity = models.FloatField(verbose_name=_('Quantity'))  # Počet kusů nebo délka rezervace
    reserved_by = models.CharField(max_length=255, verbose_name=_('Reserved by'))  # Kdo rezervaci provedl
    reservation_date = models.DateTimeField(auto_now_add=True, verbose_name=_('Reservation date'))
    expiration_date = models.DateTimeField(blank=True, null=True, verbose_name=_('Expiration date'))  # Datum vypršení rezervace

    def __str__(self):
        return f"Reservation of {self.quantity} units of {self.component.name}"
