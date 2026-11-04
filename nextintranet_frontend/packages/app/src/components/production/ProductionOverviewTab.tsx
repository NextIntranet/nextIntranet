import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { AlertTriangle, Boxes, Coins, Cpu, ExternalLink, FileCode2, FileText, Images, Layers, MessageSquare, PackageCheck } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AttachmentGallery } from "@/components/attachments/AttachmentGallery"
import { NotesPanel } from "@/components/notes/NotesPanel"
import { toSameOriginS3Url } from "@/lib/s3"
import { cn } from "@/lib/utils"
import { ExportPdfButton } from "./ExportPdfButton"
import { SeriesDetailsCard, type SeriesDetails } from "./SeriesDetailsCard"

export const NOTES_TARGET_BOM = "production.template"

export interface BomSummary {
  bom_id: string
  status: string
  series_kind?: string
  qty_planned: number
  parts: {
    lines: number
    active_lines: number
    component_types: number
    unlinked_lines: number
    dnp_lines: number
    excluded_lines: number
    needs_review_lines: number
    parts_per_board: number
    parts_total: number
    footprints: number
    sides: Record<string, number>
  }
  cost: {
    per_board: number
    total: number
    consumed: number
    priced_lines: number
    coverage: number
    price_sources: Record<string, number>
    unpriced_lines: Array<{ line_id: string; ref_group?: string | null; value?: string | null; component?: string | null }>
  }
  progress: { needed: number; sourced: number; placed: number }
  availability: Record<string, number>
  files: {
    source_file_url: string | null
    source_file_name: string | null
    source_url: string | null
    source_hash: string | null
    source_imported_at: string | null
    ibom_file_url: string | null
    ibom_file_name: string | null
    ibom_url: string | null
    ibom_updated_at: string | null
  }
  counts: { notes: number; photos: number; files: number }
  can_admin_edit: boolean
}

export const bomSummaryQueryKey = (bomId: string) => ["production-bom-summary", bomId]

export function useBomSummary(bomId: string | undefined) {
  return useQuery<BomSummary>({
    queryKey: bomSummaryQueryKey(bomId ?? ""),
    queryFn: () => apiFetch<BomSummary>(`/api/v1/production/templates/${bomId}/summary/`),
    enabled: !!bomId,
  })
}

const money = (value: number) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2 }).format(value || 0)

const qty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2))

const formatDateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "—")

const SIDE_LABELS: Record<string, string> = { both: "both sides", top: "top", bottom: "bottom" }

const AVAILABILITY_STYLES: Record<string, { label: string; className: string }> = {
  ok: { label: "In stock", className: "bg-emerald-100 text-emerald-800" },
  incoming: { label: "Incoming", className: "bg-sky-100 text-sky-800" },
  elsewhere: { label: "Other warehouse", className: "bg-amber-100 text-amber-800" },
  missing: { label: "Missing", className: "bg-rose-100 text-rose-800" },
  unlinked: { label: "Unlinked", className: "bg-slate-100 text-slate-700" },
}

function StatCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  )
}

function ProgressBar({ label, value, total, className }: { label: string; value: number; total: number; className?: string }) {
  const percent = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {qty(value)} / {qty(total)} ({percent.toFixed(0)} %)
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", className)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function FileRow({ icon, label, name, url, meta }: { icon: ReactNode; label: string; name?: string | null; url?: string | null; meta?: string | null }) {
  const href = toSameOriginS3Url(url)
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-sm font-medium text-primary hover:underline">
            <span className="truncate">{name || url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <div className="text-sm text-muted-foreground">Not uploaded</div>
        )}
        {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
      </div>
    </div>
  )
}

interface ProductionOverviewTabProps {
  series: SeriesDetails
  isTemplateSeries?: boolean
}

/** Landing tab of a BOM series: statistics, cost, source files, photos and notes. */
export function ProductionOverviewTab({ series, isTemplateSeries }: ProductionOverviewTabProps) {
  const bomId = series.id
  const queryClient = useQueryClient()
  const { data: summary, isLoading } = useBomSummary(bomId)
  const refreshSummary = () => queryClient.invalidateQueries({ queryKey: bomSummaryQueryKey(bomId) })

  const parts = summary?.parts
  const cost = summary?.cost
  const progress = summary?.progress
  const files = summary?.files
  // Unlinked lines get their own chip below; don't count them twice.
  const availability = Object.entries(summary?.availability ?? {}).filter(([status, count]) => count > 0 && status !== "unlinked")

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportPdfButton bomId={bomId} kind="overview" />
      </div>

      <SeriesDetailsCard series={series} />

      {isLoading || !summary || !parts || !cost || !progress ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={<Cpu className="h-3.5 w-3.5" />} label="Component types" value={parts.component_types} detail={`${parts.active_lines} BOM lines`} />
            <StatCard
              icon={<Boxes className="h-3.5 w-3.5" />}
              label="Parts per board"
              value={qty(parts.parts_per_board)}
              detail={`${qty(parts.parts_total)} total for ${summary.qty_planned}×`}
            />
            <StatCard
              icon={<Coins className="h-3.5 w-3.5" />}
              label="Material / board"
              value={money(cost.per_board)}
              detail={`${(cost.coverage * 100).toFixed(0)} % of lines priced`}
            />
            <StatCard icon={<Coins className="h-3.5 w-3.5" />} label="Material total" value={money(cost.total)} detail={`for ${summary.qty_planned} boards`} />
            <StatCard icon={<PackageCheck className="h-3.5 w-3.5" />} label="Consumed from stock" value={money(cost.consumed)} detail="value of placed parts" />
            <StatCard
              icon={<Layers className="h-3.5 w-3.5" />}
              label="Footprints"
              value={parts.footprints}
              detail={Object.entries(parts.sides)
                .map(([side, count]) => `${SIDE_LABELS[side] ?? side}: ${count}`)
                .join(" · ")}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-border bg-card p-3">
              <ProgressBar label="Sourced" value={progress.sourced} total={progress.needed} className="bg-sky-500" />
              <ProgressBar label="Placed" value={progress.placed} total={progress.needed} className="bg-emerald-500" />
            </div>
            <div className="flex flex-wrap content-start gap-2 rounded-lg border border-border bg-card p-3 text-xs">
              {availability.length > 0 && !isTemplateSeries ? (
                availability.map(([status, count]) => (
                  <span key={status} className={cn("rounded-full px-2 py-0.5 font-medium", AVAILABILITY_STYLES[status]?.className)}>
                    {AVAILABILITY_STYLES[status]?.label ?? status}: {count}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">No availability data.</span>
              )}
              {parts.unlinked_lines > 0 ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Unlinked lines: {parts.unlinked_lines}</span>
              ) : null}
              {parts.needs_review_lines > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Needs review: {parts.needs_review_lines}</span>
              ) : null}
              {parts.dnp_lines > 0 ? <span className="rounded-full bg-muted px-2 py-0.5 font-medium">DNP: {parts.dnp_lines}</span> : null}
            </div>
          </div>

          {cost.unpriced_lines.length > 0 ? (
            <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <summary className="flex cursor-pointer items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                {cost.unpriced_lines.length} line(s) without a known price — material cost is underestimated.
              </summary>
              <ul className="mt-2 space-y-0.5 text-xs">
                {cost.unpriced_lines.map((line) => (
                  <li key={line.line_id}>
                    <span className="font-medium">{line.ref_group || "—"}</span> · {line.component || "Unlinked"} {line.value ? `(${line.value})` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                Notes
                {summary?.counts.notes ? <span className="text-sm font-normal text-muted-foreground">({summary.counts.notes})</span> : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NotesPanel target={NOTES_TARGET_BOM} targetId={bomId} onChanged={refreshSummary} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileCode2 className="h-4 w-4" />
                Source files
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <FileRow
                icon={<FileCode2 className="h-4 w-4" />}
                label="Netlist (KiCad XML)"
                name={files?.source_file_name}
                url={files?.source_file_url}
                meta={files?.source_imported_at ? `Imported ${formatDateTime(files.source_imported_at)}` : null}
              />
              {files?.source_url ? (
                <FileRow icon={<ExternalLink className="h-4 w-4" />} label="Source URL" name={files.source_url} url={files.source_url} meta={files.source_hash ? `SHA-256 ${files.source_hash.slice(0, 16)}…` : null} />
              ) : null}
              <FileRow
                icon={<FileText className="h-4 w-4" />}
                label="Interactive BOM (iBOM)"
                name={files?.ibom_file_name || files?.ibom_url}
                url={files?.ibom_file_url || files?.ibom_url}
                meta={files?.ibom_updated_at ? `Updated ${formatDateTime(files.ibom_updated_at)}` : null}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Images className="h-4 w-4" />
                Photos & files
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentGallery target={NOTES_TARGET_BOM} targetId={bomId} onChanged={refreshSummary} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
