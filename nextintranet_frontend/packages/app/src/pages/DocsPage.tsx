import { useMemo } from "react"
import { Link, Navigate, useLocation, useParams } from "react-router-dom"
import { ExternalLink } from "lucide-react"

import { DocumentationArticle } from "@/components/DocumentationArticle"
import { cn } from "@/lib/utils"
import {
  buildPublicDocumentationHref,
  getDefaultDocumentationPath,
  getDocumentationNavSections,
  getDocumentationPage,
} from "@/lib/documentation"

function useDocumentationPath() {
  const params = useParams()
  const splat = params["*"] ?? ""
  return splat.replace(/^\/+|\/+$/g, "")
}

export function DocsPage() {
  const location = useLocation()
  const docPath = useDocumentationPath()
  const resolvedPath = docPath || ""
  const page = useMemo(() => getDocumentationPage(resolvedPath), [resolvedPath])
  const navSections = useMemo(() => getDocumentationNavSections(), [])

  if (!docPath && location.pathname === "/docs") {
    return <Navigate to={`/docs/${getDefaultDocumentationPath()}`} replace />
  }

  if (!page) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Documentation not found</h1>
        <p className="text-sm text-muted-foreground">
          No page matches <code className="text-foreground">/docs/{docPath}</code>.
        </p>
        <Link to={`/docs/${getDefaultDocumentationPath()}`} className="text-sm text-primary underline">
          Go to getting started
        </Link>
      </div>
    )
  }

  const hash = location.hash.replace(/^#/, "") || undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-8">
      <aside className="w-full shrink-0 lg:w-56 xl:w-64">
        <nav className="space-y-4 rounded-lg border border-border/70 bg-card p-4">
          {navSections.map((section) => (
            <div key={section.label} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
              <ul className="space-y-1">
                {section.pages.map((navPage) => {
                  const href = navPage.path ? `/docs/${navPage.path}` : "/docs"
                  const isActive = navPage.path === resolvedPath
                  return (
                    <li key={navPage.path || "home"}>
                      <Link
                        to={href}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {navPage.title}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-start justify-end gap-3">
          <a
            href={buildPublicDocumentationHref(resolvedPath, hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Public site
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <DocumentationArticle page={resolvedPath} hash={hash} />
      </div>
    </div>
  )
}
