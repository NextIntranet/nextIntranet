export interface UserBrief {
  id: number
  username: string
  display_name: string
}

export interface AttachmentItem {
  id: string
  target: string | null
  object_id: string
  note: string | null
  file_url: string | null
  original_name: string
  mime_type: string
  size: number
  kind: "photo" | "document" | "other"
  caption: string
  uploaded_by: UserBrief | null
  created_at: string
  can_delete: boolean
}

export interface NoteItem {
  id: string
  target: string | null
  object_id: string
  author: UserBrief | null
  body: string
  created_at: string
  updated_at: string
  edited_at: string | null
  mentions: Array<{ kind: string; target_id: string }>
  attachments: AttachmentItem[]
  can_edit: boolean
  can_delete: boolean
}

/** Query string addressing a notes/attachments target, e.g. `target=production.template&target_id=…`. */
export const targetParams = (target: string, targetId: string) =>
  new URLSearchParams({ target, target_id: targetId }).toString()

export const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "kB", "MB", "GB"]
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}
