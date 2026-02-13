import { PrinterDriverPacketAction } from "@/plugins/printer-driver/PrinterDriverPacketAction"
import type { PluginRegistry } from "@/plugins/types"

export const pluginRegistry: PluginRegistry = {
  "printer.driver": {
    actions: {
      "packets.actions": PrinterDriverPacketAction,
    },
  },
}
