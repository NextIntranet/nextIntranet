import * as React from "react"
import { useEffect, useState } from "react"
import {
  BookOpen,
  Command,
  Factory,
  Info,
  LayoutDashboard,
  Search,
  Settings2,
  UserCog,
  Users,
  Warehouse,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import type { BuildInfo } from "@nextintranet/core"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { SearchModal } from "@/components/SearchModal"
import { useRealtimeConnectionState } from "@nextintranet/core"
import { useHotkeys } from "@/lib/hotkeys"
import { cn } from "@/lib/utils"

interface UserMe {
  username: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  is_superuser?: boolean
  access_permissions?: Array<{
    area: string
    level: string
  }>
}

const permissionRank: Record<string, number> = {
  guest: 1,
  read: 2,
  write: 3,
  admin: 4,
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [userInfo, setUserInfo] = useState({ name: "Loading...", email: "" })
  const [searchOpen, setSearchOpen] = useState(false)
  const realtimeState = useRealtimeConnectionState()

  const { data: me } = useQuery<UserMe>({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })

  const { data: version } = useQuery<BuildInfo>({
    queryKey: ["version"],
    queryFn: () => apiFetch<BuildInfo>("/api/v1/version/"),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!me) {
      return
    }
    const name =
      [me.first_name, me.last_name].filter(Boolean).join(" ") ||
      me.username ||
      "User"
    setUserInfo({
      name,
      email: me.email || "",
    })
  }, [me])

  useHotkeys([
    {
      keys: "/",
      description: "Open search",
      group: "Global",
      handler: () => setSearchOpen(true),
    },
    {
      keys: "ctrl+k",
      description: "Open search",
      group: "Global",
      handler: () => setSearchOpen(true),
      allowInInput: true,
    },
  ])

  const hasPermission = (area: string, minLevel: keyof typeof permissionRank) => {
    if (me?.is_superuser) {
      return true
    }
    const permission = me?.access_permissions?.find((entry) => entry.area === area)
    if (!permission) {
      return false
    }
    const currentRank = permissionRank[permission.level] ?? 0
    return currentRank >= permissionRank[minLevel]
  }

  const canReadWarehouse = hasPermission("warehouse", "read")
  const canAccessOperations = hasPermission("warehouse-operations", "read")

  const navMain = [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard,
      items: [{ title: "Overview", url: "/" }],
    },
    {
      title: "Warehouse",
      url: "/store",
      icon: Warehouse,
      items: [
        { title: "Catalog", url: "/store" },
        ...(canReadWarehouse ? [{ title: "Locations", url: "/store/location" }] : []),
        ...(canReadWarehouse ? [{ title: "Suppliers", url: "/store/supplier" }] : []),
        ...(canReadWarehouse ? [{ title: "Parameter types", url: "/store/parameter-type" }] : []),
        ...(canReadWarehouse ? [{ title: "Inventory", url: "/store/inventory-campaign" }] : []),
        ...(canAccessOperations ? [{ title: "Reservations", url: "/store/reservations" }] : []),
        ...(canAccessOperations ? [{ title: "Purchases", url: "/store/purchase" }] : []),
        ...(canAccessOperations ? [{ title: "Requests", url: "/store/purchase-requests" }] : []),
        ...(canAccessOperations ? [{ title: "Print queue", url: "/print/queue" }] : []),
        { title: "Categories", url: "/store/category" },
      ],
    },
    {
      title: "Productions",
      url: "/production",
      icon: Factory,
      items: [
        { title: "Products", url: "/production" },
      ],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
      items: [
        { title: "Hardware", url: "/setting/hardware" },
        { title: "Software", url: "/settings/software" },
        { title: "Service tokens", url: "/settings/service-token" },
      ],
    },
  ]

  const navSecondary = [
    ...(hasPermission("user", "read")
      ? [
          {
            title: "Users",
            url: "/user",
            icon: Users,
          },
        ]
      : []),
    {
      title: "Profile",
      url: "/profile",
      icon: UserCog,
    },
    {
      title: "About",
      url: "/about",
      icon: Info,
    },
    {
      title: "Documentation",
      url: "/docs",
      icon: BookOpen,
    },
  ]

  const connectionLabel =
    realtimeState.events === "connected" || realtimeState.station === "connected"
      ? "Connected"
      : realtimeState.events === "connecting" || realtimeState.station === "connecting"
      ? "Connecting"
      : "Disconnected"

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">NextIntranet</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Workspace
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary/40"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
            <span className="ml-auto text-xs text-muted-foreground/70">/</span>
          </button>
        </div>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connectionLabel === "Connected"
                  ? "bg-emerald-500"
                  : connectionLabel === "Connecting"
                  ? "bg-amber-500"
                  : "bg-rose-500"
              )}
            />
            <span>Websocket: {connectionLabel}</span>
          </div>
          {version ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-1 text-left hover:bg-sidebar-accent"
                  title="Build version details"
                >
                  <Info className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {version.commit_short} · {version.build_method}
                    {version.build_date ? ` · ${formatBuildDate(version.build_date)}` : ""}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-72 text-xs">
                <div className="space-y-1.5">
                  <div className="font-medium text-foreground">Build version</div>
                  <VersionRow label="Commit">
                    {version.commit_url ? (
                      <a
                        href={version.commit_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {version.commit_short}
                      </a>
                    ) : (
                      <span className="font-mono">{version.commit_short}</span>
                    )}
                  </VersionRow>
                  <VersionRow label="Branch">{version.branch}</VersionRow>
                  <VersionRow label="Build">{version.build_method}</VersionRow>
                  <VersionRow label="Date">
                    {version.build_date ? formatBuildDate(version.build_date) : "unknown"}
                  </VersionRow>
                  <a
                    href={version.github_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block pt-1 text-primary hover:underline"
                  >
                    GitHub repository ↗
                  </a>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
        <NavUser user={userInfo} />
      </SidebarFooter>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </Sidebar>
  )
}

function formatBuildDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function VersionRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right">{children}</span>
    </div>
  )
}
