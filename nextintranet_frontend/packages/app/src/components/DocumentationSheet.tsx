import { ExternalLink } from "lucide-react"
import { Link } from "react-router-dom"

import { DocumentationArticle } from "@/components/DocumentationArticle"
import { useDocumentationSheet } from "@/components/DocumentationSheetContext"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  buildDocumentationHref,
  buildPublicDocumentationHref,
  getDocumentationPage,
} from "@/lib/documentation"

export function DocumentationSheet() {
  const { open, target, openDocSheet, closeDocSheet } = useDocumentationSheet()

  if (!target) {
    return null
  }

  const page = getDocumentationPage(target.page)

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && closeDocSheet()}>
      <SheetContent side="right" className="flex w-full max-w-2xl flex-col gap-0 p-0">
        <SheetHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
          <SheetTitle>{page?.title ?? "Documentation"}</SheetTitle>
          {page?.description ? (
            <SheetDescription>{page.description}</SheetDescription>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <DocumentationArticle
            page={target.page}
            hash={target.hash}
            compact
            showTitle={false}
            onDocumentationNavigate={(page, hash) => openDocSheet({ page, hash })}
          />
        </div>

        <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" size="sm" asChild>
            <Link to={buildDocumentationHref(target.page, target.hash)} onClick={closeDocSheet}>
              Open full documentation
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a
              href={buildPublicDocumentationHref(target.page, target.hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Public site
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
