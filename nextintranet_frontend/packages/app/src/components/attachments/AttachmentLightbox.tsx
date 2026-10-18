import { useEffect } from "react"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { toSameOriginS3Url } from "@/lib/s3"
import type { AttachmentItem } from "@/components/notes/types"

interface AttachmentLightboxProps {
  photos: AttachmentItem[]
  index: number | null
  onIndexChange: (index: number | null) => void
}

/** Full-size photo viewer with prev/next (arrow keys) for a list of image attachments. */
export function AttachmentLightbox({ photos, index, onIndexChange }: AttachmentLightboxProps) {
  const photo = index !== null ? photos[index] : null
  const count = photos.length

  useEffect(() => {
    if (index === null || count < 2) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") onIndexChange((index + 1) % count)
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + count) % count)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, count, onIndexChange])

  const url = toSameOriginS3Url(photo?.file_url)

  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent className="max-w-[min(96vw,1200px)] gap-3 p-3 sm:p-4">
        <DialogTitle className="truncate pr-8 text-sm">{photo?.caption || photo?.original_name}</DialogTitle>
        <DialogDescription className="sr-only">Photo {index !== null ? index + 1 : 0} of {count}</DialogDescription>
        <div className="relative flex min-h-48 items-center justify-center rounded-md bg-black/90">
          {url ? (
            <img src={url} alt={photo?.caption || photo?.original_name} className="max-h-[78vh] max-w-full object-contain" />
          ) : null}
          {count > 1 && index !== null ? (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 opacity-80"
                aria-label="Previous photo"
                onClick={() => onIndexChange((index - 1 + count) % count)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 opacity-80"
                aria-label="Next photo"
                onClick={() => onIndexChange((index + 1) % count)}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {index !== null ? index + 1 : 0} / {count}
            {photo?.uploaded_by ? ` · ${photo.uploaded_by.display_name}` : ""}
            {photo ? ` · ${new Date(photo.created_at).toLocaleString()}` : ""}
          </span>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" download={photo?.original_name} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Download className="h-3.5 w-3.5" />
              Original
            </a>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
