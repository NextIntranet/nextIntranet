import { Link } from "react-router-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSlug from "rehype-slug"
import rehypeAutolinkHeadings from "rehype-autolink-headings"

import { cn } from "@/lib/utils"

type MarkdownViewProps = {
  content: string
  className?: string
}

export function MarkdownView({ content, className }: MarkdownViewProps) {
  return (
    <div
      className={cn(
        "docs-markdown max-w-none text-sm text-foreground",
        "[&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold",
        "[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:scroll-mt-20",
        "[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:scroll-mt-20",
        "[&_p]:mb-4 [&_p]:leading-relaxed",
        "[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:mb-1",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted [&_pre]:p-4",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left",
        "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2",
        "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",
        "[&_blockquote]:mb-4 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "wrap",
              properties: { className: ["anchor-link"] },
            },
          ],
        ]}
        components={{
          a: ({ href, children, ...props }) => {
            if (href?.startsWith("/docs") || href?.endsWith(".md")) {
              const docHref = href.endsWith(".md")
                ? `/docs/${href.replace(/\.md$/, "").replace(/^\/?/, "")}`
                : href
              return (
                <Link to={docHref} {...props}>
                  {children}
                </Link>
              )
            }
            if (href?.startsWith("http")) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>
              )
            }
            return (
              <a href={href} {...props}>
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
