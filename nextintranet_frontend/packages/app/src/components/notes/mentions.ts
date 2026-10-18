/**
 * Mention syntax shared with the backend (`nextintranet_backend/services/mentions.py`):
 *   [@Jan Novák](mention:user/42)   [#ESP32](mention:component/<uuid>)   [[packet:<uuid>]]
 */
export type MentionKind = "user" | "component" | "packet" | "location" | "production" | "template" | "purchase"

const MENTION_HREF_RE = /^mention:([a-z_]+)\/([A-Za-z0-9_-]+)$/
const SHORTHAND_RE = /\[\[([a-z_]+):([A-Za-z0-9_-]+)\]\]/g

export const parseMentionHref = (href: string | undefined) => {
  const match = href ? MENTION_HREF_RE.exec(href) : null
  return match ? { kind: match[1] as MentionKind, id: match[2] } : null
}

/** `[[packet:id]]` → `[](mention:packet/id)` so it renders through the same link path. */
export const expandMentionShorthand = (body: string) =>
  body.replace(SHORTHAND_RE, (_, kind: string, id: string) => `[](mention:${kind}/${id})`)

const escapeLabel = (label: string) => label.replace(/[[\]()]/g, "")

export const mentionToken = (kind: MentionKind, id: string | number, label: string) => {
  const prefix = kind === "user" ? "@" : kind === "component" ? "#" : ""
  return `[${prefix}${escapeLabel(label)}](mention:${kind}/${id})`
}

export const MENTION_ROUTES: Partial<Record<MentionKind, (id: string) => string>> = {
  component: (id) => `/store/component/${id}`,
  packet: (id) => `/store/packet/${id}`,
  location: (id) => `/store/location/${id}`,
  production: (id) => `/production/${id}`,
  template: (id) => `/production/bom/${id}`,
  purchase: (id) => `/store/purchase/${id}`,
}
