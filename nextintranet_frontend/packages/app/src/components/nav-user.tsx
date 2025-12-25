import {
  Moon,
  Sun,
  Laptop,
  User,
  LogOut,
} from "lucide-react"
import { tokenStorage } from "@nextintranet/core"
import { useNavigate } from "react-router-dom"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useTheme } from "@/components/theme-provider"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar?: string
  }
}) {
  const { setTheme, theme } = useTheme()
  const navigate = useNavigate()

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const ThemeIcon = () => {
      if (theme === 'light') return <Sun className="size-4" />
      if (theme === 'dark') return <Moon className="size-4" />
      return <Laptop className="size-4" />
  }

  const themeLabel = theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'

  const handleLogout = () => {
    tokenStorage.clearTokens()
    navigate("/login", { replace: true })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
             <User className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{user.name}</span>
            <span className="truncate text-xs">{user.email}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
       <SidebarMenuItem>
          <SidebarMenuButton 
            onClick={toggleTheme}
            tooltip={`Theme: ${themeLabel}`}
          >
            <ThemeIcon />
            <span>Theme: {themeLabel}</span>
          </SidebarMenuButton>
       </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={handleLogout} tooltip="Logout">
          <LogOut className="size-4" />
          <span>Logout</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
