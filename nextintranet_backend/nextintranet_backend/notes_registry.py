"""Which models can carry notes and attachments.

Apps register their models in `AppConfig.ready()`:

    register_target('production.template', Template, module='manufacturing')

Clients then address a target as `?target=production.template&target_id=<pk>`. Only
registered keys are accepted, so notes can't be attached to arbitrary models.
"""
from dataclasses import dataclass
from typing import Callable

from django.db import models


def _authenticated(user, obj) -> bool:
    return bool(user and user.is_authenticated)


@dataclass(frozen=True)
class NoteTarget:
    key: str
    model: type[models.Model]
    module: str
    can_view: Callable = _authenticated
    can_write: Callable = _authenticated


_TARGETS: dict[str, NoteTarget] = {}


def register_target(
    key: str,
    model: type[models.Model],
    *,
    module: str,
    can_view: Callable | None = None,
    can_write: Callable | None = None,
) -> None:
    _TARGETS[key] = NoteTarget(
        key=key,
        model=model,
        module=module,
        can_view=can_view or _authenticated,
        can_write=can_write or _authenticated,
    )


def get_target(key: str) -> NoteTarget | None:
    return _TARGETS.get(key or '')


def target_key_for_model(model: type[models.Model]) -> str | None:
    for target in _TARGETS.values():
        if target.model is model:
            return target.key
    return None
