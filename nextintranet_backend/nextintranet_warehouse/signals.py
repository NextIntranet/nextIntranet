from typing import Optional

from django.db import transaction
from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from nextintranet_backend.realtime import broadcast_event
from .models.component import Component, ComponentParameter, Document, SupplierRelation

IGNORED_APP_LABELS = {
    'admin',
    'contenttypes',
    'sessions',
    'token_blacklist',
}


def _should_emit(sender) -> bool:
    app_label = sender._meta.app_label
    return app_label not in IGNORED_APP_LABELS


def _emit_model_change(
    instance,
    action: str,
    using: Optional[str] = None,
    extra: Optional[dict] = None
) -> None:
    if not _should_emit(instance.__class__):
        return

    payload = {
        'appLabel': instance._meta.app_label,
        'model': instance._meta.model_name,
        'pk': str(instance.pk),
        'action': action,
    }
    if extra:
        payload.update(extra)

    transaction.on_commit(lambda: broadcast_event('model.changed', payload), using=using)


def _emit_component_update(
    component_id,
    change: str,
    entity: Optional[str] = None,
    entity_id: Optional[str] = None
) -> None:
    payload = {
        'componentId': str(component_id),
        'change': change,
        'entity': entity,
        'entityId': str(entity_id) if entity_id else None,
    }

    transaction.on_commit(lambda: broadcast_event('component.updated', payload))


@receiver(post_save, sender=Component)
def component_saved(sender, instance: Component, created: bool, **kwargs):
    _emit_component_update(instance.id, 'created' if created else 'updated', entity='component', entity_id=instance.id)


@receiver(post_delete, sender=Component)
def component_deleted(sender, instance: Component, **kwargs):
    _emit_component_update(instance.id, 'deleted', entity='component', entity_id=instance.id)


@receiver(post_save, sender=ComponentParameter)
def component_parameter_saved(sender, instance: ComponentParameter, created: bool, **kwargs):
    change = 'parameter.created' if created else 'parameter.updated'
    _emit_component_update(instance.component_id, change, entity='component_parameter', entity_id=instance.id)


@receiver(post_delete, sender=ComponentParameter)
def component_parameter_deleted(sender, instance: ComponentParameter, **kwargs):
    _emit_component_update(instance.component_id, 'parameter.deleted', entity='component_parameter', entity_id=instance.id)


@receiver(post_save, sender=SupplierRelation)
def supplier_relation_saved(sender, instance: SupplierRelation, created: bool, **kwargs):
    change = 'supplier_relation.created' if created else 'supplier_relation.updated'
    _emit_component_update(instance.component_id, change, entity='supplier_relation', entity_id=instance.id)


@receiver(post_delete, sender=SupplierRelation)
def supplier_relation_deleted(sender, instance: SupplierRelation, **kwargs):
    _emit_component_update(instance.component_id, 'supplier_relation.deleted', entity='supplier_relation', entity_id=instance.id)


@receiver(post_save, sender=Document)
def document_saved(sender, instance: Document, created: bool, **kwargs):
    change = 'document.created' if created else 'document.updated'
    _emit_component_update(instance.component_id, change, entity='document', entity_id=instance.id)


@receiver(post_delete, sender=Document)
def document_deleted(sender, instance: Document, **kwargs):
    _emit_component_update(instance.component_id, 'document.deleted', entity='document', entity_id=instance.id)


@receiver(post_save)
def model_saved(sender, instance, created: bool, raw: bool, using: str, **kwargs):
    if raw:
        return
    action = 'created' if created else 'updated'
    _emit_model_change(instance, action, using=using)


@receiver(post_delete)
def model_deleted(sender, instance, using: str, **kwargs):
    _emit_model_change(instance, 'deleted', using=using)


@receiver(m2m_changed)
def model_m2m_changed(sender, instance, action: str, reverse: bool, model, pk_set, using: str, **kwargs):
    if action not in {'post_add', 'post_remove', 'post_clear'}:
        return
    if not _should_emit(instance.__class__):
        return

    payload = {
        'relatedModel': model._meta.label_lower,
        'relatedIds': [str(pk) for pk in (pk_set or [])],
        'direction': 'reverse' if reverse else 'forward',
        'action': f'm2m.{action}',
    }
    _emit_model_change(instance, 'updated', using=using, extra=payload)
