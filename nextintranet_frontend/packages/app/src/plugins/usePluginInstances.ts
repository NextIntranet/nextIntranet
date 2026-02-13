import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"

import type { PluginInstance } from "@/plugins/types"

export function usePluginInstances() {
  return useQuery<PluginInstance[]>({
    queryKey: ["plugin-instances"],
    queryFn: () => apiFetch<PluginInstance[]>("/api/v1/plugins/instances/"),
  })
}
