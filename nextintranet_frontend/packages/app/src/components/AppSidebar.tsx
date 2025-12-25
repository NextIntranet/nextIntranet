import * as React from "react"
import { useEffect, useState } from "react"
import {
  BookOpen,
  Box,
  Command,
  Send,
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

interface UserMe {
  username: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
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
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userInfo} />
      </SidebarFooter>
    </Sidebar>
  )
}
