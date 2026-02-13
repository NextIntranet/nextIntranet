import { useMemo } from "react"
import type { ComponentType } from "react"

import { cn } from "@/lib/utils"
import { pluginRegistry } from "@/plugins/registry"
import type { ExtensionPointName, PluginActionContext, PluginInstance } from "@/plugins/types"
import { usePluginInstances } from "@/plugins/usePluginInstances"

type ExtensionPointProps = {
  name: ExtensionPointName
  context?: PluginActionContext
  className?: string
}

export function ExtensionPoint({ name, context, className }: ExtensionPointProps) {
  const { data: instances } = usePluginInstances()

  const actions = useMemo(() => {
    const availableInstances = instances ?? []
    if (!availableInstances.length) {
      return []
    }

    return availableInstances
      .filter((instance) => instance.enabled && instance.capabilities?.includes(name))
      .map((instance) => {
        const plugin = pluginRegistry[instance.definition_key]
        const Action = plugin?.actions?.[name]
        if (!Action) {
          return null
        }
        return { instance, Action }
      })
      .filter((entry): entry is { instance: PluginInstance; Action: ComponentType<any> } =>
        Boolean(entry),
      )
  }, [instances, name])

  if (!actions.length) {
    return null
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {actions.map(({ instance, Action }) => (
        <Action key={`${instance.definition_key}-${instance.id}`} instance={instance} context={context} />
      ))}
    </div>
  )
}
