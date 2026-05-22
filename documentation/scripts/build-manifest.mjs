import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import GithubSlugger from "github-slugger"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const documentationRoot = path.resolve(__dirname, "..")
const contentDir = path.join(documentationRoot, "content")

const headingRegex = /^(#{1,6})\s+(.+)$/gm

function docPathFromFile(relativePath) {
  const withoutExt = relativePath.replace(/\.md$/i, "")
  if (withoutExt === "index") {
    return ""
  }
  if (withoutExt.endsWith("/index")) {
    return withoutExt.slice(0, -"/index".length)
  }
  return withoutExt
}

function extractHeadings(markdownBody) {
  const slugger = new GithubSlugger()
  const headings = []
  let match
  while ((match = headingRegex.exec(markdownBody)) !== null) {
    const level = match[1].length
    const text = match[2].trim().replace(/\s+#+\s*$/, "")
    if (!text) {
      continue
    }
    headings.push({
      level,
      text,
      id: slugger.slug(text),
    })
  }
  return headings
}

function walkMarkdownFiles(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath, relative))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relative)
    }
  }
  return files
}

function titleFromPath(docPath) {
  const segment = docPath.split("/").filter(Boolean).pop() || "home"
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

const pages = walkMarkdownFiles(contentDir)
  .map((relativePath) => {
    const raw = fs.readFileSync(path.join(contentDir, relativePath), "utf8")
    const parsed = matter(raw)
    const docPath = docPathFromFile(relativePath)
    const headings = extractHeadings(parsed.content)
    const draft = Boolean(parsed.data.draft)

    return {
      path: docPath,
      file: relativePath.replace(/\\/g, "/"),
      title: parsed.data.title || titleFromPath(docPath),
      description: parsed.data.description || "",
      draft,
      headings,
    }
  })
  .filter((page) => !page.draft)
  .sort((a, b) => a.path.localeCompare(b.path))

const manifest = {
  generatedAt: new Date().toISOString(),
  pages,
}

const manifestPath = path.join(documentationRoot, "manifest.json")
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
console.log(`Wrote ${pages.length} pages to ${manifestPath}`)
