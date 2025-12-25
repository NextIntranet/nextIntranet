import { useMemo } from "react"
import { Link, useLocation } from "react-router-dom"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const segmentTitleMap: Record<string, string> = {
  store: "Warehouse",
  locations: "Locations",
  supplier: "Suppliers",
  reservations: "Reservations",
  "purchase-requests": "Requests",
  categories: "Categories",
  component: "Component",
  production: "Production",
  docs: "Documentation",
  guides: "Guides",
  changelog: "Changelog",
  settings: "Settings",
  teams: "Teams",
  billing: "Billing",
  user: "Users",
  profile: "Profile",
  projects: "Projects",
  design: "Design Engineering",
  sales: "Sales & Marketing",
  travel: "Travel",
  support: "Support",
  feedback: "Feedback",
}

const formatSegment = (segment: string) => {
  if (/^\d+$/.test(segment)) {
    return `#${segment}`
  }

  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function SiteHeader() {
  const location = useLocation()

  const breadcrumbs = useMemo(() => {
    const segments = location.pathname.split("/").filter(Boolean)

    return segments.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join("/")}`
      const label = segmentTitleMap[segment] ?? formatSegment(segment)

      return { href, label }
    })
  }, [location.pathname])

  return (
    <header className="flex h-16 shrink-0 items-center gap-2">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink asChild>
                <Link to="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {breadcrumbs.length > 0 && (
              <BreadcrumbSeparator className="hidden md:block" />
            )}
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1

              return (
                <BreadcrumbItem key={crumb.href}>
                  {isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  )
}
