import { Outlet } from "react-router-dom"

import { AppSidebar } from "@/components/AppSidebar"
import { DocumentationSheetProvider } from "@/components/DocumentationSheetContext"
import { SiteHeader } from "@/components/SiteHeader"
import { ThemeProvider } from "@/components/theme-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { HardwareScannerListener } from "@/components/HardwareScannerListener"
import { QuickActionsFab } from "@/components/QuickActionsFab"

export function Layout() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <DocumentationSheetProvider>
        <SidebarProvider className="bg-background">
          <AppSidebar />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              <Outlet />
            </div>
          </SidebarInset>
          <HardwareScannerListener />
          <QuickActionsFab />
          <Toaster richColors />
        </SidebarProvider>
      </DocumentationSheetProvider>
    </ThemeProvider>
  )
}
