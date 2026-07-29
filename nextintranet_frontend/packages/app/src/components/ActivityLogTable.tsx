import { ArrowDownCircle, ArrowUpCircle, Database, ExternalLink, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"

import { SerialBadge } from "@/components/packetSerial"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getOperationFlow, getOperationLabel } from "@/lib/stockOperations"

export interface ActivityLogItem {
  id: string
  packet_id?: string | null
  packet_label?: string | null
  packet_serial_code?: string | null
  packet_location_leaf?: string | null
  component_id?: string | null
  user_name?: string | null
  occurred_at: string
  activity_type: string
  source: string
  stock_operation_id?: string | null
  stock_operation_type?: string | null
  quantity?: number | null
  relative_quantity?: boolean | null
  unit_price?: number | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  scan: "Scan",
  packet_created: "Created",
  packet_updated: "Edited",
  packet_moved: "Moved",
  packet_status_changed: "Status",
  component_created: "Component created",
  component_updated: "Component edited",
  identifier_added: "Identifier added",
  identifier_removed: "Identifier removed",
}

export function formatActivityType(activity: ActivityLogItem) {
  if (activity.activity_type === "stock_operation" && activity.stock_operation_type) {
    return getOperationLabel(activity.stock_operation_type)
  }
  return ACTIVITY_TYPE_LABELS[activity.activity_type] ?? activity.activity_type.replaceAll("_", " ")
}

function ActivityTypeIcon({ activity }: { activity: ActivityLogItem }) {
  if (activity.activity_type === "stock_operation" && activity.stock_operation_type) {
    const flow = getOperationFlow(activity.stock_operation_type)
    if (flow === "in") return <ArrowDownCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
    if (flow === "out") return <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
    return <RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  }
  if (activity.activity_type === "scan") return <Database className="h-3.5 w-3.5 shrink-0 text-blue-600" />
  if (activity.activity_type.includes("removed")) return <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
  if (activity.activity_type.includes("added") || activity.activity_type.includes("created")) {
    return <ArrowDownCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
  }
  return <RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

function formatChangeMap(value?: Record<string, unknown> | null) {
  if (!value || Object.keys(value).length === 0) return ""
  return Object.entries(value)
    .map(([key, entry]) => `${key}: ${entry == null ? "-" : String(entry)}`)
    .join(", ")
}

function metaValue<T>(metadata: Record<string, unknown> | null | undefined, key: string): T | null {
  if (!metadata) return null
  const value = metadata[key]
  return value == null ? null : (value as T)
}

/** Lines shown under the summary tooltip (change details, inventory meta...). */
function summaryDetailLines(activity: ActivityLogItem): string[] {
  const lines: string[] = []
  const before = formatChangeMap(activity.before)
  const after = formatChangeMap(activity.after)
  if (before) lines.push(`Before: ${before}`)
  if (after) lines.push(`After: ${after}`)
  if (activity.unit_price != null) {
    lines.push(`Unit price: ${activity.unit_price.toFixed(2)}`)
  }
  const recorded = metaValue<number>(activity.metadata, "recorded_quantity")
  const counted = metaValue<number>(activity.metadata, "counted_quantity")
  const countedPrice = metaValue<number | string>(activity.metadata, "counted_price")
  const supplierRelation = metaValue<string>(activity.metadata, "supplier_relation_id")
  if (recorded != null) lines.push(`Recorded before inventory: ${recorded}`)
  if (counted != null) lines.push(`Counted during inventory: ${counted}`)
  if (countedPrice != null) lines.push(`Counted unit price: ${countedPrice}`)
  if (supplierRelation) lines.push(`Supplier relation: ${supplierRelation}`)
  const productionId = metaValue<string>(activity.metadata, "production_id")
  if (productionId) lines.push(`Production run: ${productionId}`)
  return lines
}

/** Client context lines (who/where/which client) for scan & operation rows. */
function clientInfoLines(activity: ActivityLogItem): Array<[string, string]> {
  const m = activity.metadata
  const lines: Array<[string, string]> = []
  if (!m) return lines
  const client = (m.client ?? null) as { ip?: string; user_agent?: string } | null
  if (client?.ip) lines.push(["IP", client.ip])
  if (client?.user_agent) lines.push(["User agent", client.user_agent])
  const station = m.stationId as string | undefined
  const agent = m.agentId as string | undefined
  const device = m.deviceId as string | undefined
  const reader = m.reader as string | undefined
  if (station) lines.push(["Station", station])
  if (agent) lines.push(["Agent", agent])
  if (device) lines.push(["Device", device])
  if (reader) lines.push(["Reader", reader])
  const scan = m.scan as string | undefined
  if (activity.activity_type === "scan" && scan) lines.push(["Scan text", scan])
  return lines
}

function TimeUserCell({ activity }: { activity: ActivityLogItem }) {
  const clientLines = clientInfoLines(activity)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex cursor-default flex-col leading-tight">
          <span className="truncate">{new Date(activity.occurred_at).toLocaleString()}</span>
          <span className="truncate text-[10px] text-muted-foreground/80">{activity.user_name || "-"}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        <div className="space-y-0.5 whitespace-pre-line break-all">
          <div>{activity.occurred_at}</div>
          <div>{activity.user_name ? `Recorded by ${activity.user_name}` : "No user recorded"}</div>
          {clientLines.map(([label, value]) => (
            <div key={label}>
              <span className="text-muted-foreground/70">{label}: </span>
              {value}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function SummaryCell({ activity, showAdminLink }: { activity: ActivityLogItem; showAdminLink?: boolean }) {
  const description = activity.description || "-"
  const details = summaryDetailLines(activity)
  const productionId = metaValue<string>(activity.metadata, "production_id")
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 cursor-default truncate">{description}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-md">
          <div className="space-y-0.5 whitespace-pre-line break-all">
            <div>{description}</div>
            {details.map((line) => (
              <div key={line} className="text-muted-foreground/80">
                {line}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
      {productionId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={`/production/${productionId}`}
              className="inline-flex shrink-0 text-primary/70 transition-colors hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          </TooltipTrigger>
          <TooltipContent>Open production run {productionId}</TooltipContent>
        </Tooltip>
      )}
      {showAdminLink && activity.stock_operation_id && (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={`/admin/nextintranet_warehouse/stockoperation/${activity.stock_operation_id}/change/`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
            >
              <Database className="h-3 w-3" />
            </a>
          </TooltipTrigger>
          <TooltipContent>Open in Django admin</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

function QtyCell({ activity }: { activity: ActivityLogItem }) {
  const flow = activity.stock_operation_type ? getOperationFlow(activity.stock_operation_type) : "neutral"
  const colorClass = flow === "in" ? "text-emerald-600" : flow === "out" ? "text-red-600" : "text-foreground"
  if (activity.quantity == null) {
    return <span className="text-muted-foreground">-</span>
  }
  const signed =
    flow === "in" || flow === "out"
      ? Math.abs(Number(activity.quantity))
      : activity.quantity
  const text =
    activity.relative_quantity === false
      ? `= ${activity.quantity}`
      : `${flow === "in" ? "+" : flow === "out" ? "−" : ""}${signed}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-default font-medium ${colorClass}`}>{text}</span>
      </TooltipTrigger>
      <TooltipContent>
        {activity.relative_quantity === false
          ? `Absolute count set to ${activity.quantity}`
          : `Relative change: ${text}`}
      </TooltipContent>
    </Tooltip>
  )
}

function PriceCell({ activity, diffBase }: { activity: ActivityLogItem; diffBase?: number | null }) {
  if (activity.unit_price == null || !(activity.unit_price > 0)) {
    return <span className="text-muted-foreground">—</span>
  }
  const diff = diffBase != null && diffBase > 0 ? Number(activity.unit_price) - Number(diffBase) : null
  return (
    <div className="flex flex-col leading-tight">
      <span className="font-medium text-foreground">{activity.unit_price.toFixed(2)}</span>
      {diff != null && Math.abs(diff) >= 0.001 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`cursor-default text-[10px] ${diff > 0 ? "text-red-500" : "text-emerald-600"}`}>
              {diff > 0 ? "+" : ""}
              {diff.toFixed(2)}
            </span>
          </TooltipTrigger>
          <TooltipContent>Difference vs. current unit value ({Number(diffBase).toFixed(2)})</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

const HEAD_CLASS = "h-7 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
const CELL_CLASS = "h-7 px-2 text-xs"

export function ActivityLogTable({
  activities,
  showPacketColumn = false,
  showPriceColumn = false,
  priceDiffBase = null,
  showAdminLink = false,
}: {
  activities: ActivityLogItem[]
  showPacketColumn?: boolean
  /** Show a dedicated unit-price column (packet page). */
  showPriceColumn?: boolean
  /** Current unit value used for the diff display in the price column. */
  priceDiffBase?: number | null
  showAdminLink?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <Table className="w-full table-fixed">
        <TableHeader className="bg-muted/40">
          <TableRow className="border-border/50">
            <TableHead className={`${HEAD_CLASS} w-[14%]`}>Type</TableHead>
            {showPacketColumn && <TableHead className={`${HEAD_CLASS} w-[17%]`}>Packet</TableHead>}
            {showPacketColumn && <TableHead className={`${HEAD_CLASS} w-[13%]`}>Location</TableHead>}
            <TableHead className={`${HEAD_CLASS} w-[9%]`}>Qty</TableHead>
            {showPriceColumn && <TableHead className={`${HEAD_CLASS} w-[10%]`}>Price</TableHead>}
            <TableHead className={`${HEAD_CLASS} w-[18%]`}>Time / User</TableHead>
            <TableHead className={HEAD_CLASS}>Summary</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity) => (
            <TableRow key={activity.id} className="border-border/40">
              <TableCell className={`${CELL_CLASS} text-foreground`}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <ActivityTypeIcon activity={activity} />
                  <span className="truncate">{formatActivityType(activity)}</span>
                </span>
              </TableCell>
              {showPacketColumn && (
                <TableCell className={`${CELL_CLASS} text-muted-foreground`}>
                  {activity.packet_id ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      {activity.packet_serial_code && (
                        <Link to={`/store/packet/${activity.packet_id}`} className="shrink-0">
                          <SerialBadge code={activity.packet_serial_code} />
                        </Link>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            to={`/store/packet/${activity.packet_id}`}
                            className="min-w-0 truncate font-mono text-[10px] text-primary hover:underline underline-offset-2"
                          >
                            {activity.packet_id.slice(0, 8)}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>{activity.packet_id}</TooltipContent>
                      </Tooltip>
                    </span>
                  ) : (
                    "-"
                  )}
                </TableCell>
              )}
              {showPacketColumn && (
                <TableCell className={`${CELL_CLASS} text-muted-foreground`}>
                  {activity.packet_label ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block cursor-default truncate">
                          {activity.packet_location_leaf || activity.packet_label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{activity.packet_label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    "-"
                  )}
                </TableCell>
              )}
              <TableCell className={CELL_CLASS}>
                <QtyCell activity={activity} />
              </TableCell>
              {showPriceColumn && (
                <TableCell className={CELL_CLASS}>
                  <PriceCell activity={activity} diffBase={priceDiffBase} />
                </TableCell>
              )}
              <TableCell className={`${CELL_CLASS} text-muted-foreground`}>
                <TimeUserCell activity={activity} />
              </TableCell>
              <TableCell className={`${CELL_CLASS} text-muted-foreground`}>
                <SummaryCell activity={activity} showAdminLink={showAdminLink} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
