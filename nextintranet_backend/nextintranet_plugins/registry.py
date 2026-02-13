from typing import Dict, List, Optional

from .printer_driver import PRINTER_DRIVER_DEFINITION
from .supplier_component_rest import SUPPLIER_COMPONENT_REST_DEFINITION
from .types import PluginDefinition

PLUGIN_DEFINITIONS: Dict[str, PluginDefinition] = {
    PRINTER_DRIVER_DEFINITION.key: PRINTER_DRIVER_DEFINITION,
    SUPPLIER_COMPONENT_REST_DEFINITION.key: SUPPLIER_COMPONENT_REST_DEFINITION,
}


def get_plugin_definition(key: str) -> Optional[PluginDefinition]:
    return PLUGIN_DEFINITIONS.get(key)


def get_plugin_definitions() -> List[PluginDefinition]:
    return list(PLUGIN_DEFINITIONS.values())
