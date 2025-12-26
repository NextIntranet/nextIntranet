from django.db import migrations


def forwards(apps, schema_editor):
    Component = apps.get_model('nextintranet_warehouse', 'Component')
    Document = apps.get_model('nextintranet_warehouse', 'Document')

    document_fields = {field.name for field in Document._meta.get_fields()}
    has_is_primary = 'is_primary' in document_fields
    has_access_level = 'access_level' in document_fields

    components = Component.objects.exclude(primary_image__isnull=True).exclude(primary_image__exact='')
    for component in components:
        url = component.primary_image
        document = Document.objects.filter(component=component, url=url).first()
        if document is None:
            payload = {
                'component': component,
                'name': 'image',
                'doc_type': 'image',
                'url': url,
            }
            if has_is_primary:
                payload['is_primary'] = True
            if has_access_level:
                payload['access_level'] = 'public'
            Document.objects.create(**payload)
        else:
            update_fields = []
            if has_is_primary and not getattr(document, 'is_primary', False):
                document.is_primary = True
                update_fields.append('is_primary')
            if has_access_level and not getattr(document, 'access_level', None):
                document.access_level = 'public'
                update_fields.append('access_level')
            if update_fields:
                document.save(update_fields=update_fields)

        component.primary_image = None
        component.save(update_fields=['primary_image'])


def backwards(apps, schema_editor):
    Component = apps.get_model('nextintranet_warehouse', 'Component')
    Document = apps.get_model('nextintranet_warehouse', 'Document')

    document_fields = {field.name for field in Document._meta.get_fields()}
    has_is_primary = 'is_primary' in document_fields

    components = Component.objects.filter(primary_image__isnull=True)
    for component in components:
        documents = Document.objects.filter(
            component=component,
            doc_type='image',
        ).exclude(url__isnull=True).exclude(url__exact='')
        if has_is_primary:
            documents = documents.order_by('-is_primary', 'id')
        document = documents.first()
        if document:
            component.primary_image = document.url
            component.save(update_fields=['primary_image'])


class Migration(migrations.Migration):
    dependencies = [
        ('nextintranet_warehouse', '0037_purchase_invoice_and_manual_items'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
