import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"

import { ForbiddenPage } from "@/pages/ForbiddenPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { Skeleton } from "@/components/ui/skeleton"

type PermissionLevel = "guest" | "read" | "write" | "admin"

interface UserMe {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: PermissionLevel
  }>
}

const permissionRank: Record<PermissionLevel, number> = {
  guest: 1,
  read: 2,
  write: 3,
  admin: 4,
}

export function RequirePermission({
  area,
  minLevel,
  children,
}: {
  area: string
  minLevel: PermissionLevel
  children: React.ReactNode
}) {
  const { data: me, isLoading, error } = useQuery<UserMe>({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (error || !me) {
    return <NotFoundPage />
  }

  if (me.is_superuser) {
    return <>{children}</>
  }

  const permission = (Array.isArray(me.access_permissions) ? me.access_permissions : []).find(
    (entry) => entry.area === area
  )

  if (!permission) {
    return <NotFoundPage />
  }

  const currentRank = permissionRank[permission.level] ?? 0
  const requiredRank = permissionRank[minLevel]

  if (currentRank >= requiredRank) {
    return <>{children}</>
  }

  if (permission.level === "guest") {
    return <NotFoundPage />
  }

  return <ForbiddenPage />
}
