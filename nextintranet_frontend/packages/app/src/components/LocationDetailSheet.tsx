import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { apiFetch } from "@nextintranet/core"
import { Boxes, Copy, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { PrintActions } from "@/components/PrintActions"

interface LocationDetail {
  id: string
  uuid: string
  name: string
  location?: string | null
  description?: string | null
  full_path: string
  can_store_items: boolean
  parent?: string | null
  map?: string | null
}

interface LocationDetailSheetProps {
  locationId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LocationDetailSheet({ locationId, open, onOpenChange }: LocationDetailSheetProps) {
  const { data: locationDetail, isLoading } = useQuery<LocationDetail>({
    queryKey: ["location", locationId],
    queryFn: () => apiFetch<LocationDetail>(`/api/v1/store/location/${locationId}/`),
    enabled: open && !!locationId,
  })

  const handleCopyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Link copied.")
    } catch {
      toast.error("Unable to copy link.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg">
        <SheetHeader>
          <SheetTitle>Location details</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : locationDetail ? (
          <div className="mt-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Name</p>
              <p className="text-sm text-foreground">{locationDetail.name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Full path</p>
              <p className="text-sm text-foreground">{locationDetail.full_path}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Location</p>
                <p className="text-sm text-foreground">{locationDetail.location || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Can store items
                </p>
                <p className="text-sm text-foreground">
                  {locationDetail.can_store_items ? "Yes" : "No"}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Description</p>
              <p className="text-sm text-foreground">
                {locationDetail.description || "No description."}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Map</p>
              {locationDetail.map ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={locationDetail.map} target="_blank" rel="noreferrer">
                      Open map
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopyLink(locationDetail.map || "")}
                    aria-label="Copy map link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No map uploaded.</p>
              )}
            </div>
            <div className="space-y-2">
              <Button variant="outline" className="w-full gap-2" asChild>
                <Link to={`/store?locations=${locationDetail.id}`}>
                  <Boxes className="h-4 w-4" />
                  Show location components
                </Link>
              </Button>
              <Button variant="outline" className="w-full gap-2" asChild>
                <Link to={`/store/location/${locationDetail.id}`}>
                  <ExternalLink className="h-4 w-4" />
                  Open in Locations
                </Link>
              </Button>
            </div>
            <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Print label</p>
              <div className="mt-2">
                <PrintActions
                  targetType="location"
                  targetId={locationDetail.id}
                  label={locationDetail.full_path || locationDetail.name}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 text-sm text-muted-foreground">
            Location details are not available.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
