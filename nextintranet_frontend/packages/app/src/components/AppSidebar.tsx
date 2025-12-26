import * as React from "react"
import { useEffect, useState } from "react"
import {
  BookOpen,
  Box,
  Command,
  Send,
  Search,
  Settings2,
  SquareTerminal,
  UserCog,
  Users,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"

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
import { SearchModal } from "@/components/SearchModal"
import { useRealtimeConnectionState } from "@nextintranet/core"
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "/" && !searchOpen) {
        const target = event.target as HTMLElement | null
        const isInput =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        if (!isInput) {
          event.preventDefault()
          setSearchOpen(true)
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [searchOpen])

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
      icon: SquareTerminal,
      items: [{ title: "Overview", url: "/" }],
    },
    {
      title: "Warehouse",
      url: "/store",
      icon: Box,
      items: [
        { title: "Catalog", url: "/store" },
        ...(canReadWarehouse ? [{ title: "Locations", url: "/store/location" }] : []),
        ...(canReadWarehouse ? [{ title: "Suppliers", url: "/store/supplier" }] : []),
        ...(canAccessOperations ? [{ title: "Reservations", url: "/store/reservations" }] : []),
        ...(canAccessOperations ? [{ title: "Requests", url: "/store/purchase-requests" }] : []),
        { title: "Categories", url: "/store/category" },
      ],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
      items: [],
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
      title: "Documentation",
      url: "/docs",
      icon: BookOpen,
    },
    {
      title: "Feedback",
      url: "/feedback",
      icon: Send,
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
        </div>
        <NavUser user={userInfo} />
      </SidebarFooter>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </Sidebar>
  )
}
