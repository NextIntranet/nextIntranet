import type { ComponentType } from "react"

export type ExtensionPointName =
  | "page.status"
  | "packets.actions"
  | "locations.actions"
  | "component.actions"
  | "printqueue.actions"
  | "documents.actions"

export interface PluginInstance {
  id: string
  definition_key: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
  capabilities: ExtensionPointName[]
  definition_name?: string
  definition_version?: string
  config_schema?: Record<string, unknown>
}

export interface PacketActionContext {
  packetId: string
}

export interface LocationActionContext {
  locationId?: string | null
}

export interface ComponentActionContext {
  componentId: string
}

export interface DocumentActionContext {
  componentId: string
  activeTab?: string
}

export interface PrintQueueActionContext {
  queueId?: string | null
}

export type PluginActionContext =
  | PacketActionContext
  | LocationActionContext
  | ComponentActionContext
  | DocumentActionContext
  | PrintQueueActionContext

export interface PluginActionProps {
  instance: PluginInstance
  context?: PluginActionContext
}

export type PluginActionComponent = ComponentType<PluginActionProps>

export interface PluginDefinition {
  actions?: Partial<Record<ExtensionPointName, PluginActionComponent>>
}

export type PluginRegistry = Record<string, PluginDefinition>
