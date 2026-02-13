from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable, List, Optional

if TYPE_CHECKING:
    from nextintranet_backend.models.plugin import PluginInstance


ExecuteHandler = Callable[["PluginInstance", dict, object], dict]


@dataclass(frozen=True)
class PluginDefinition:
    key: str
    name: str
    version: str
    capabilities: List[str]
    config_schema: dict
    execute: Optional[ExecuteHandler] = None
