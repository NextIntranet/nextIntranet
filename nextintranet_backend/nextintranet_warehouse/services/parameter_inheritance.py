from __future__ import annotations

import re
from typing import Dict

from django.db import transaction

from ..models.category import CategoryParameterRule
from ..models.component import Component, ComponentParameter


def get_effective_rules(category) -> Dict[str, CategoryParameterRule]:
    """Walk MPTT ancestors root→leaf, merge rules (child overrides parent).

    Returns ``{parameter_type_id: rule}`` dict.
    """
    if category is None:
        return {}

    ancestors = category.get_ancestors(include_self=True)
    rules_qs = CategoryParameterRule.objects.filter(
        category__in=ancestors,
    ).select_related('category', 'parameter_type').order_by('category__level')

    effective: Dict[str, CategoryParameterRule] = {}
    for rule in rules_qs:
        effective[str(rule.parameter_type_id)] = rule
    return effective


def resolve_template(template: str, component: Component, param_cache: dict | None = None) -> str:
    """Single-pass ``{ParamName}`` substitution.

    ``param_cache`` is an optional ``{param_type_name: value}`` dict for the
    component's *manual* parameters.  Missing references stay as literal
    ``{Name}``.  No recursion — prevents infinite loops.
    """
    if '{' not in template:
        return template

    if param_cache is None:
        param_cache = {}
        for p in component.parameters.filter(is_inherited=False).select_related('parameter_type'):
            if p.parameter_type:
                param_cache[p.parameter_type.name] = p.value or ''

    def _replace(match):
        name = match.group(1)
        return param_cache.get(name, match.group(0))

    return re.sub(r'\{([^}]+)\}', _replace, template)


def apply_inherited_parameters(component: Component) -> None:
    """Delete stale inherited params, create/update inherited params.

    Skips parameter types that already have a manual override
    (``is_inherited=False``).
    """
    if component.category is None:
        # No category → remove all inherited params
        ComponentParameter.objects.filter(component=component, is_inherited=True).delete()
        return

    effective_rules = get_effective_rules(component.category)
    if not effective_rules:
        ComponentParameter.objects.filter(component=component, is_inherited=True).delete()
        return

    # Build param cache from manual params for template resolution
    param_cache: dict[str, str] = {}
    manual_param_type_ids: set[str] = set()
    for p in component.parameters.select_related('parameter_type'):
        if not p.is_inherited and p.parameter_type:
            param_cache[p.parameter_type.name] = p.value or ''
            manual_param_type_ids.add(str(p.parameter_type_id))

    # Remove inherited params whose rule no longer exists
    existing_inherited = {
        str(p.parameter_type_id): p
        for p in component.parameters.filter(is_inherited=True).select_related('parameter_type')
    }

    # IDs of rules that should produce inherited params (excluding manual overrides)
    desired_ids = set(effective_rules.keys()) - manual_param_type_ids

    # Delete stale inherited params
    stale_ids = set(existing_inherited.keys()) - desired_ids
    if stale_ids:
        ComponentParameter.objects.filter(
            component=component,
            is_inherited=True,
            parameter_type_id__in=stale_ids,
        ).delete()

    # Create or update inherited params
    for pt_id in desired_ids:
        rule = effective_rules[pt_id]
        resolved_value = resolve_template(rule.value_template, component, param_cache)

        existing = existing_inherited.get(pt_id)
        if existing:
            if existing.value != resolved_value or existing.source_rule_id != rule.id:
                existing.value = resolved_value
                existing.source_rule = rule
                existing.save(update_fields=['value', 'value_number', 'source_rule'])
        else:
            ComponentParameter(
                component=component,
                parameter_type=rule.parameter_type,
                value=resolved_value,
                is_inherited=True,
                source_rule=rule,
            ).save()


def bulk_update_for_rule_change(category) -> None:
    """Iterate all components in the category subtree and apply inherited params."""
    descendant_categories = category.get_descendants(include_self=True)
    components_qs = Component.objects.filter(
        category__in=descendant_categories,
    ).select_related('category')

    CHUNK = 200
    component_ids = list(components_qs.values_list('id', flat=True))
    for i in range(0, len(component_ids), CHUNK):
        chunk_ids = component_ids[i:i + CHUNK]
        for comp in Component.objects.filter(id__in=chunk_ids).select_related('category'):
            apply_inherited_parameters(comp)
