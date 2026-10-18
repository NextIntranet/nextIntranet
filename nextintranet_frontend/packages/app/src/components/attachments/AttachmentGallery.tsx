import { DragEvent, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { FileText, ImagePlus, Loader2, Pencil, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toSameOriginS3Url } from "@/lib/s3"
import { cn } from "@/lib/utils"
import { formatFileSize, targetParams, type AttachmentItem } from "@/components/notes/types"
import { AttachmentLightbox } from "./AttachmentLightbox"

export const attachmentsQueryKey = (target: string, targetId: string) => ["attachments", target, targetId]

interface AttachmentGalleryProps {
  target: string
  targetId: string
  readOnly?: boolean
  /** Called after the attachment set changes (e.g. to refresh counts elsewhere). */
  onChanged?: () => void
}

/**
 * Photos & files attached directly to an object (not to a note): drag-and-drop upload,
 * thumbnail grid with a lightbox, file list with captions. Generic over notes targets.
 */
export function AttachmentGallery({ target, targetId, readOnly = false, onChanged }: AttachmentGalleryProps) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [captionDraft, setCaptionDraft] = useState("")
  const queryKey = attachmentsQueryKey(target, targetId)

  const { data: attachments = [], isLoading } = useQuery<AttachmentItem[]>({
    queryKey,
    queryFn: () => apiFetch<AttachmentItem[]>(`/api/v1/core/attachments/?${targetParams(target, targetId)}&standalone=1`),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey })
    onChanged?.()
  }

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      const data = new FormData()
      data.append("target", target)
      data.append("target_id", targetId)
      files.forEach((file) => data.append("file", file))
      return apiFetch<AttachmentItem[]>("/api/v1/core/attachments/", { method: "POST", body: data })
    },
    onSuccess: (created) => {
      refresh()
      toast.success(created.length === 1 ? "File uploaded." : `${created.length} files uploaded.`)
    },
    onError: () => toast.error("Upload failed."),
  })

  const captionMutation = useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string }) =>
      apiFetch(`/api/v1/core/attachments/${id}/`, { method: "PATCH", body: JSON.stringify({ caption }) }),
    onSuccess: () => {
      setEditingId(null)
      refresh()
    },
    onError: () => toast.error("Failed to save caption."),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/core/attachments/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      refresh()
      toast.success("File deleted.")
    },
    onError: () => toast.error("Failed to delete file."),
  })

  const photos = attachments.filter((item) => item.kind === "photo")
  const documents = attachments.filter((item) => item.kind !== "photo")

  const upload = (files: File[]) => {
    if (files.length > 0) uploadMutation.mutate(files)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (readOnly) return
    upload(Array.from(event.dataTransfer.files ?? []))
  }

  const confirmDelete = (item: AttachmentItem) => {
    if (window.confirm(`Delete "${item.original_name}"?`)) deleteMutation.mutate(item.id)
  }

  const startEdit = (item: AttachmentItem) => {
    setEditingId(item.id)
    setCaptionDraft(item.caption)
  }

  const captionEditor = (item: AttachmentItem) => (
    <form
      className="flex gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        captionMutation.mutate({ id: item.id, caption: captionDraft })
      }}
    >
      <Input autoFocus value={captionDraft} onChange={(event) => setCaptionDraft(event.target.value)} placeholder="Caption" className="h-7 text-xs" />
      <Button type="submit" size="sm" className="h-7" disabled={captionMutation.isPending}>
        Save
      </Button>
    </form>
  )

  return (
    <div
      onDragOver={(event) => {
        if (readOnly) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn("space-y-3 rounded-lg transition", dragging && "outline outline-2 outline-dashed outline-primary/60")}
    >
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload photos / files
          </Button>
          <span className="text-xs text-muted-foreground">or drop files here</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              upload(Array.from(event.target.files ?? []))
              event.target.value = ""
            }}
          />
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="aspect-square w-full" />
          ))}
        </div>
      ) : null}

      {!isLoading && attachments.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
          <ImagePlus className="h-4 w-4" />
          No photos or files yet.
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
          {photos.map((photo, index) => (
            <figure key={photo.id} className="group relative overflow-hidden rounded-md border border-border bg-muted">
              <button type="button" className="block aspect-square w-full" onClick={() => setLightboxIndex(index)} title={photo.original_name}>
                <img
                  src={toSameOriginS3Url(photo.file_url) ?? undefined}
                  alt={photo.caption || photo.original_name}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                />
              </button>
              {editingId === photo.id ? (
                <div className="p-1">{captionEditor(photo)}</div>
              ) : photo.caption ? (
                <figcaption className="truncate px-1.5 py-1 text-xs">{photo.caption}</figcaption>
              ) : null}
              {!readOnly ? (
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <Button variant="secondary" size="icon" className="h-6 w-6" title="Edit caption" onClick={() => startEdit(photo)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {photo.can_delete ? (
                    <Button variant="secondary" size="icon" className="h-6 w-6" title="Delete" onClick={() => confirmDelete(photo)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}

      {documents.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {documents.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a href={toSameOriginS3Url(item.file_url) ?? undefined} target="_blank" rel="noreferrer" className="block truncate font-medium text-primary hover:underline">
                  {item.original_name}
                </a>
                {editingId === item.id ? (
                  captionEditor(item)
                ) : (
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.caption, formatFileSize(item.size), item.uploaded_by?.display_name, new Date(item.created_at).toLocaleDateString()]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              {!readOnly ? (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit caption" onClick={() => startEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {item.can_delete ? (
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete" onClick={() => confirmDelete(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <AttachmentLightbox photos={photos} index={lightboxIndex} onIndexChange={setLightboxIndex} />
    </div>
  )
}
