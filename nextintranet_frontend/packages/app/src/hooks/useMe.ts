import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"

export type PermissionLevel = "hidden" | "guest" | "read" | "write" | "admin"

export interface Me {
  id: number
  username: string
  first_name?: string
  last_name?: string
  is_superuser: boolean
  is_staff: boolean
  access_permissions: Array<{ area: string; level: PermissionLevel }>
}

const levelRank: Record<PermissionLevel, number> = { hidden: 0, guest: 1, read: 2, write: 3, admin: 4 }

/** Current user, shared `["me"]` query. */
export function useMe() {
  return useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => apiFetch<Me>("/api/v1/me/"),
    staleTime: 60_000,
  })
}

/** True for superusers, or when the user's level in `area` is at least `minLevel`. */
export function hasAreaLevel(me: Me | undefined, area: string, minLevel: PermissionLevel) {
  if (!me) return false
  if (me.is_superuser) return true
  const entry = me.access_permissions?.find((permission) => permission.area === area)
  return !!entry && levelRank[entry.level] >= levelRank[minLevel]
}
