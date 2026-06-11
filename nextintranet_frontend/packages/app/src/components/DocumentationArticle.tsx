import { useEffect, useMemo, useRef } from "react"

import { MarkdownView } from "@/components/MarkdownView"
import { cn } from "@/lib/utils"
import {
  getDocumentationPage,
  scrollDocumentationToHash,
  type DocPagePath,
} from "@/lib/documentation"

type DocumentationArticleProps = {
  page: DocPagePath | (string & {})
  hash?: string
  compact?: boolean
  showTitle?: boolean
  onDocumentationNavigate?: (page: string, hash?: string) => void
}

export function DocumentationArticle({
  page,
  hash,
  compact = false,
  showTitle = true,
  onDocumentationNavigate,
}: DocumentationArticleProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const resolvedPath = page.replace(/^\/+|\/+$/g, "")
  const docPage = useMemo(() => getDocumentationPage(resolvedPath), [resolvedPath])

  useEffect(() => {
    if (!hash || !docPage) {
      return
    }
    const timer = window.setTimeout(
      () => scrollDocumentationToHash(hash, scrollRootRef.current),
      0,
    )
    return () => window.clearTimeout(timer)
  }, [hash, resolvedPath, docPage?.content])

  if (!docPage) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Documentation page not found: <code className="text-foreground">{resolvedPath}</code>
        </p>
      </div>
    )
  }

  return (
    <div ref={scrollRootRef} className={cn("min-w-0 space-y-4", compact && "space-y-3")}>
      {showTitle ? (
        <div className="space-y-1">
          <h1
            className={cn(
              "font-semibold text-foreground",
              compact ? "text-lg" : "text-2xl",
            )}
          >
            {docPage.title}
          </h1>
          {docPage.description ? (
            <p className="text-sm text-muted-foreground">{docPage.description}</p>
          ) : null}
        </div>
      ) : null}

      <MarkdownView
        content={docPage.content}
        onDocumentationNavigate={onDocumentationNavigate}
      />
    </div>
  )
}

export function useDocumentationArticle(page: string) {
  return useMemo(() => getDocumentationPage(page.replace(/^\/+|\/+$/g, "")), [page])
}
