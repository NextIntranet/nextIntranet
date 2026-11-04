import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { MessageSquare, Paperclip, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AttachmentLightbox } from "@/components/attachments/AttachmentLightbox"
import { toSameOriginS3Url } from "@/lib/s3"
import { NoteBody } from "./NoteBody"
import { NoteEditor } from "./NoteEditor"
import { formatFileSize, targetParams, type NoteItem } from "./types"

export const notesQueryKey = (target: string, targetId: string) => ["notes", target, targetId]

interface NotesPanelProps {
  /** Registered notes target, e.g. `production.template`. */
  target: string
  targetId: string
  readOnly?: boolean
  emptyText?: string
  /** Called after notes change (e.g. to refresh counters elsewhere). */
  onChanged?: () => void
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?"

const formatWhen = (value: string) => {
  const date = new Date(value)
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  return date.toLocaleString()
}

/** Generic markdown notes thread for any object registered in the backend notes registry. */
export function NotesPanel({ target, targetId, readOnly = false, emptyText = "No notes yet.", onChanged }: NotesPanelProps) {
  const queryClient = useQueryClient()
  const queryKey = notesQueryKey(target, targetId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ noteId: string; index: number } | null>(null)

  const { data: notes = [], isLoading } = useQuery<NoteItem[]>({
    queryKey,
    queryFn: () => apiFetch<NoteItem[]>(`/api/v1/core/notes/?${targetParams(target, targetId)}`),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey })
    onChanged?.()
  }

  const createMutation = useMutation({
    mutationFn: async ({ body, files }: { body: string; files: File[] }) => {
      const note = await apiFetch<NoteItem>("/api/v1/core/notes/", {
        method: "POST",
        body: JSON.stringify({ target, target_id: targetId, body }),
      })
      if (files.length > 0) {
        const data = new FormData()
        data.append("note", note.id)
        files.forEach((file) => data.append("file", file))
        await apiFetch("/api/v1/core/attachments/", { method: "POST", body: data })
      }
      return note
    },
    onSuccess: () => refresh(),
    onError: () => {
      refresh()
      toast.error("Failed to save the note.")
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiFetch<NoteItem>(`/api/v1/core/notes/${id}/`, { method: "PATCH", body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setEditingId(null)
      refresh()
    },
    onError: () => toast.error("Failed to update the note."),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/core/notes/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      refresh()
      toast.success("Note deleted.")
    },
    onError: () => toast.error("Failed to delete the note."),
  })

  const lightboxPhotos = lightbox ? notes.find((note) => note.id === lightbox.noteId)?.attachments.filter((a) => a.kind === "photo") ?? [] : []

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : notes.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          {emptyText}
        </div>
      ) : (
        <ol className="space-y-4">
          {notes.map((note) => {
            const authorName = note.author?.display_name || "Unknown user"
            const photos = note.attachments.filter((item) => item.kind === "photo")
            const files = note.attachments.filter((item) => item.kind !== "photo")
            return (
              <li key={note.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" title={note.author?.username}>
                  {initials(authorName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold">{authorName}</span>
                    <time className="text-xs text-muted-foreground" dateTime={note.created_at} title={new Date(note.created_at).toLocaleString()}>
                      {formatWhen(note.created_at)}
                    </time>
                    {note.edited_at ? (
                      <span className="text-xs text-muted-foreground" title={`Edited ${new Date(note.edited_at).toLocaleString()}`}>
                        (edited)
                      </span>
                    ) : null}
                    {!readOnly && editingId !== note.id ? (
                      <span className="ml-auto flex gap-0.5">
                        {note.can_edit ? (
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit note" onClick={() => setEditingId(note.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {note.can_delete ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Delete note"
                            onClick={() => window.confirm("Delete this note?") && deleteMutation.mutate(note.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </span>
                    ) : null}
                  </div>

                  {editingId === note.id ? (
                    <div className="mt-1.5">
                      <NoteEditor
                        initialValue={note.body}
                        submitLabel="Save"
                        allowFiles={false}
                        autoFocus
                        busy={updateMutation.isPending}
                        onSubmit={(body) => updateMutation.mutateAsync({ id: note.id, body })}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  ) : (
                    <div className="mt-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <NoteBody body={note.body} />
                      {photos.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {photos.map((photo, index) => (
                            <button
                              key={photo.id}
                              type="button"
                              className="h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
                              title={photo.original_name}
                              onClick={() => setLightbox({ noteId: note.id, index })}
                            >
                              <img src={toSameOriginS3Url(photo.file_url) ?? undefined} alt={photo.original_name} loading="lazy" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {files.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {files.map((file) => (
                            <a
                              key={file.id}
                              href={toSameOriginS3Url(file.file_url) ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-xs text-primary ring-1 ring-border hover:underline"
                            >
                              <Paperclip className="h-3 w-3" />
                              <span className="max-w-56 truncate">{file.original_name}</span>
                              <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {!readOnly ? (
        <NoteEditor
          busy={createMutation.isPending}
          onSubmit={(body, files) => createMutation.mutateAsync({ body, files })}
        />
      ) : null}

      <AttachmentLightbox
        photos={lightboxPhotos}
        index={lightbox?.index ?? null}
        onIndexChange={(index) => setLightbox(index === null || !lightbox ? null : { ...lightbox, index })}
      />
    </div>
  )
}
