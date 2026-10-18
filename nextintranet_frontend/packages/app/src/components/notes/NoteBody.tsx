import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { defaultUrlTransform } from "react-markdown"
import { AtSign } from "lucide-react"

import { ComponentRef } from "@/components/ComponentRef"
import { MarkdownView } from "@/components/MarkdownView"
import { PacketRef } from "@/components/PacketRef"
import { cn } from "@/lib/utils"
import { MENTION_ROUTES, expandMentionShorthand, parseMentionHref } from "./mentions"

const keepMentions = (url: string) => (url.startsWith("mention:") ? url : defaultUrlTransform(url))

const textOf = (children: ReactNode): string => {
  if (typeof children === "string" || typeof children === "number") return String(children)
  if (Array.isArray(children)) return children.map(textOf).join("")
  return ""
}

const chipClass = "mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0 align-baseline text-[0.95em] font-medium text-primary no-underline"

function renderMention(href: string | undefined, children: ReactNode) {
  const mention = parseMentionHref(href)
  if (!mention) return undefined
  const label = textOf(children)

  switch (mention.kind) {
    case "user":
      return (
        <span className={chipClass} title={`User ${label.replace(/^@/, "")}`}>
          <AtSign className="h-3 w-3" />
          {label.replace(/^@/, "") || `user ${mention.id}`}
        </span>
      )
    case "component":
      return (
        <span className={cn(chipClass, "[&_a]:inline-flex [&_a]:no-underline")}>
          <ComponentRef componentId={mention.id} fallbackName={label.replace(/^#/, "") || undefined} />
        </span>
      )
    case "packet":
      return (
        <span className={chipClass}>
          <PacketRef packetId={mention.id} />
        </span>
      )
    default: {
      const route = MENTION_ROUTES[mention.kind]
      const text = label || `${mention.kind} ${mention.id.slice(0, 8)}`
      return route ? (
        <Link to={route(mention.id)} className={chipClass}>
          {text}
        </Link>
      ) : (
        <span className={chipClass}>{text}</span>
      )
    }
  }
}

/** Markdown note body with @user / #component / [[type:id]] mentions rendered as chips. */
export function NoteBody({ body, className }: { body: string; className?: string }) {
  return (
    <MarkdownView
      content={expandMentionShorthand(body)}
      className={cn("[&_p:last-child]:mb-0 [&_p]:mb-2", className)}
      urlTransform={keepMentions}
      renderLink={renderMention}
    />
  )
}
