import matter from "gray-matter"

export type DocumentationHeading = {
  level: number
  text: string
  id: string
}

export type DocumentationPage = {
  path: string
  file: string
  title: string
  description: string
  draft: boolean
  headings: DocumentationHeading[]
}

export type DocumentationManifest = {
  generatedAt: string
  pages: DocumentationPage[]
}

const manifestModules = {
  ...import.meta.glob("../../../../documentation/manifest.json", {
    import: "default",
    eager: true,
  }),
  ...import.meta.glob("../../../../../documentation/manifest.json", {
    import: "default",
    eager: true,
  }),
} as Record<string, DocumentationManifest>

export const documentationManifest: DocumentationManifest =
  Object.values(manifestModules)[0] ?? { generatedAt: "", pages: [] }

const markdownModules = {
  ...import.meta.glob("../../../../documentation/content/**/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob("../../../../../documentation/content/**/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
} as Record<string, string>

function filePathFromDocPath(docPath: string) {
  if (!docPath) {
    return "index.md"
  }
  return `${docPath}.md`
}

function moduleKeyForFile(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/")
  const suffix = `/documentation/content/${normalized}`
  const entry = Object.keys(markdownModules).find((key) => key.replace(/\\/g, "/").endsWith(suffix))
  return entry ?? null
}

export function getDocumentationPage(docPath: string) {
  const normalizedPath = docPath.replace(/^\/+|\/+$/g, "")
  const filePath = filePathFromDocPath(normalizedPath)
  const moduleKey = moduleKeyForFile(filePath)
  if (!moduleKey) {
    return null
  }

  const raw = markdownModules[moduleKey]
  const parsed = matter(raw)
  const meta =
    documentationManifest.pages.find((page) => page.path === normalizedPath) ?? null

  return {
    path: normalizedPath,
    title: meta?.title ?? parsed.data.title ?? normalizedPath,
    description: meta?.description ?? parsed.data.description ?? "",
    content: parsed.content,
    headings: meta?.headings ?? [],
  }
}

export function getDefaultDocumentationPath() {
  return "guide/getting-started"
}

export type DocPagePath = DocumentationPage["path"]

export function buildDocumentationHref(page: string, hash?: string) {
  const normalizedPage = page.replace(/^\/+|\/+$/g, "")
  const base = normalizedPage ? `/docs/${normalizedPage}` : "/docs"
  return hash ? `${base}#${hash}` : base
}

export const publicDocsBaseUrl =
  (import.meta.env.VITE_PUBLIC_DOCS_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://nextintranet.github.io/nextIntranet"

export function buildPublicDocumentationHref(page: string, hash?: string) {
  const normalizedPage = page.replace(/^\/+|\/+$/g, "")
  const base = normalizedPage ? `${publicDocsBaseUrl}/${normalizedPage}/` : `${publicDocsBaseUrl}/`
  return hash ? `${base}#${hash}` : base
}

type NavSection = {
  label: string
  pages: DocumentationPage[]
}

export function getDocumentationNavSections(): NavSection[] {
  const sections: NavSection[] = [
    { label: "Home", pages: [] },
    { label: "Product", pages: [] },
    { label: "Documentation", pages: [] },
    { label: "Developer", pages: [] },
  ]

  for (const page of documentationManifest.pages) {
    if (!page.path) {
      sections[0].pages.push(page)
      continue
    }
    if (page.path.startsWith("product/")) {
      sections[1].pages.push(page)
      continue
    }
    if (page.path.startsWith("developer/")) {
      sections[3].pages.push(page)
      continue
    }
    sections[2].pages.push(page)
  }

  return sections.filter((section) => section.pages.length > 0)
}
