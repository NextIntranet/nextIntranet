import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import {
  buildDocumentationHref,
  buildPublicDocumentationHref,
  type DocPagePath,
} from "@/lib/documentation"

type DocLinkProps = {
  page: DocPagePath | (string & {})
  hash?: string
  external?: boolean
  className?: string
  children: ReactNode
}

export function DocLink({ page, hash, external = false, className, children }: DocLinkProps) {
  if (external) {
    return (
      <a
        href={buildPublicDocumentationHref(page, hash)}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    )
  }

  return (
    <Link to={buildDocumentationHref(page, hash)} className={className}>
      {children}
    </Link>
  )
}
