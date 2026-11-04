import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Loader2, Pencil, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MarkdownView } from "@/components/MarkdownView"
import { hasAreaLevel, useMe } from "@/hooks/useMe"
import { cn } from "@/lib/utils"

export interface SeriesDetails {
  id: string
  name: string
  description?: string | null
  planned_date?: string | null
  qty_planned: number
  status: string
  series_kind?: string
}

type Draft = { name: string; description: string; planned_date: string; qty_planned: string }

const toDraft = (series: SeriesDetails): Draft => ({
  name: series.name,
  description: series.description || "",
  planned_date: series.planned_date || "",
  qty_planned: String(series.qty_planned ?? 0),
})

const isClosed = (status: string) => status === "locked" || status === "finished"

/**
 * Name, planned date, planned quantity and description of a BOM series, editable in place.
 * A closed series only takes name/description/date, and only from production admins.
 */
export function SeriesDetailsCard({ series }: { series: SeriesDetails }) {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const closed = isClosed(series.status)
  const isAdmin = hasAreaLevel(me, "production", "admin")
  const canEdit = !closed || isAdmin
  // Template series hold the imported reference; their quantity is always 0.
  const canEditQty = !closed && series.series_kind !== "template"

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(series))

  useEffect(() => {
    if (!editing) setDraft(toDraft(series))
  }, [series, editing])

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch(`/api/v1/production/templates/${series.id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", series.id] })
      queryClient.invalidateQueries({ queryKey: ["production-bom-summary", series.id] })
      queryClient.invalidateQueries({ queryKey: ["production-availability", series.id] })
      queryClient.invalidateQueries({ queryKey: ["notes"] })
      queryClient.invalidateQueries({ queryKey: ["production-product"] })
      setEditing(false)
      toast.success("Series updated.")
    },
    onError: (error) =>
      toast.error((error as { data?: { error?: string } })?.data?.error || "Failed to update the series."),
  })

  const save = () => {
    const name = draft.name.trim()
    if (!name) {
      toast.error("Name cannot be empty.")
      return
    }
    const payload: Record<string, unknown> = {
      name,
      description: draft.description,
      planned_date: draft.planned_date || null,
    }
    if (canEditQty) {
      const qty = Math.max(1, Math.floor(Number(draft.qty_planned) || 0))
      payload.qty_planned = qty
    }
    if (closed && !window.confirm(`This series is ${series.status}. Save the changes anyway?`)) return
    saveMutation.mutate(payload)
  }

  const plannedDate = series.planned_date ? new Date(series.planned_date).toLocaleDateString() : "—"

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {editing ? (
          <>
            {closed ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                This series is {series.status}. You can change its name, description and planned date as a production
                administrator; the change is recorded as a note.
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_170px]">
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Name
                <Input value={draft.name} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Boards (qty)
                <Input
                  type="number"
                  min={1}
                  value={draft.qty_planned}
                  disabled={!canEditQty}
                  title={canEditQty ? undefined : "Quantity can't be changed on a closed or template series"}
                  onChange={(e) => setDraft({ ...draft, qty_planned: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Planned date
                <Input
                  type="date"
                  value={draft.planned_date}
                  onChange={(e) => setDraft({ ...draft, planned_date: e.target.value })}
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Description (Markdown)
              <textarea
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold">{series.name}</h2>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    Boards: <span className="font-semibold text-foreground tabular-nums">{series.qty_planned}</span>
                  </span>
                  <span>
                    Planned date: <span className="font-semibold text-foreground">{plannedDate}</span>
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit}
                title={canEdit ? "Edit name, quantity, date and description" : "Only production administrators can edit a closed series"}
                onClick={() => setEditing(true)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
            <div className={cn("border-t border-border pt-3", !series.description && "text-sm text-muted-foreground")}>
              {series.description ? <MarkdownView content={series.description} /> : "No description."}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
