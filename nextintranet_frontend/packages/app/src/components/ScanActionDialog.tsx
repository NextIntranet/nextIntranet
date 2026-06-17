import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type ScanOperation = "FIND" | "SOURCED" | "PLACED"

export type ScanActionTarget = {
  barcode: string
  lineId: string
  componentId: string | null
  componentName: string
  lineRefLabel: string
  lineValue: string
  needed: number
  sourced: number
  placed: number
}

type PacketItem = {
  id: string
  count?: string | number | null
  is_active?: boolean
  location?: { name?: string; full_path?: string } | null
}

type Paginated<T> = { results: T[] }

const unwrap = <T,>(data: T[] | Paginated<T> | undefined): T[] =>
  !data ? [] : Array.isArray(data) ? data : data.results || []

const toNumber = (value: string | number | null | undefined) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatQty = (value: number) => {
  if (!Number.isFinite(value)) return "0"
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value))
  return value.toFixed(2).replace(/\.?0+$/, "")
}

const isInHome = (packet: PacketItem, homePath?: string | null) => {
  if (!homePath) return false
  const path = packet.location?.full_path || packet.location?.name || ""
  return path === homePath || path.startsWith(`${homePath}/`)
}

type ScanActionDialogProps = {
  target: ScanActionTarget | null
  defaultOperation: ScanOperation
  homePath?: string | null
  isPending?: boolean
  /** Commit a Source/Place. `barcode` is the scanned code or a chosen bag id. */
  onCommit: (operation: "SOURCED" | "PLACED", qty: number, barcode: string) => void
  /** Find = just keep the focused row, no commit. */
  onFind: () => void
  onClose: () => void
}

export function ScanActionDialog({
  target,
  defaultOperation,
  homePath = null,
  isPending = false,
  onCommit,
  onFind,
  onClose,
}: ScanActionDialogProps) {
  const open = Boolean(target)
  const [operation, setOperation] = useState<ScanOperation>(defaultOperation)
  const [qtyInput, setQtyInput] = useState("1")

  const remaining = useMemo(() => {
    if (!target) return 0
    const progress = operation === "PLACED" ? target.placed : target.sourced
    return Math.max(0, target.needed - progress)
  }, [target, operation])

  useEffect(() => {
    if (!target) return
    setOperation(defaultOperation)
  }, [target, defaultOperation])

  useEffect(() => {
    if (!target) return
    setQtyInput(formatQty(remaining > 0 ? remaining : 1))
  }, [target, operation, remaining])

  const { data, isLoading } = useQuery<PacketItem[] | Paginated<PacketItem>>({
    queryKey: ["scan-action-bags", target?.componentId],
    queryFn: () =>
      apiFetch<PacketItem[] | Paginated<PacketItem>>(
        `/api/v1/store/packet/?page_size=300&component=${target?.componentId}`,
      ),
    enabled: open && Boolean(target?.componentId),
  })

  const bags = useMemo(() => {
    const rows = unwrap(data).filter((p) => p.is_active !== false && toNumber(p.count) > 0)
    if (!homePath) return rows
    return rows
      .map((packet, index) => ({ packet, index }))
      .sort((a, b) => {
        const ah = isInHome(a.packet, homePath) ? 0 : 1
        const bh = isInHome(b.packet, homePath) ? 0 : 1
        return ah - bh || a.index - b.index
      })
      .map((entry) => entry.packet)
  }, [data, homePath])

  if (!target) return null

  const commit = (barcode: string) => {
    if (operation === "FIND") {
      onFind()
      return
    }
    const qty = Number(qtyInput)
    if (!Number.isFinite(qty) || qty <= 0) return
    onCommit(operation, qty, barcode)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.componentName}</DialogTitle>
          <DialogDescription>
            Reference {target.lineRefLabel} · {target.lineValue}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            {(["FIND", "SOURCED", "PLACED"] as const).map((op) => (
              <Button
                key={op}
                type="button"
                size="sm"
                variant={operation === op ? "default" : "outline"}
                onClick={() => setOperation(op)}
              >
                {op === "FIND" ? "Find" : op === "SOURCED" ? "Source" : "Place"}
              </Button>
            ))}
          </div>

          {operation !== "FIND" ? (
            <div className="space-y-2">
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                Remaining to {operation === "SOURCED" ? "source" : "place"}:{" "}
                <span className="font-medium text-foreground">{formatQty(remaining)}</span>
              </div>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-foreground">Quantity</span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={qtyInput}
                  autoFocus
                  onChange={(e) => setQtyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      commit(target.barcode)
                    }
                  }}
                />
              </label>
            </div>
          ) : null}

          {target.componentId ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Bags (home first)</div>
              <div className="max-h-[40vh] divide-y divide-border/50 overflow-auto rounded-md border border-border/70">
                {isLoading ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading bags...
                  </div>
                ) : bags.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No bags with stock.</div>
                ) : (
                  bags.map((packet) => (
                    <div key={packet.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                      <div className="leading-tight">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono">{packet.id}</span>
                          {isInHome(packet, homePath) ? (
                            <span className="inline-flex rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-emerald-800">
                              home
                            </span>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground">
                          {packet.location?.full_path || packet.location?.name || "-"} · qty {formatQty(toNumber(packet.count))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={isPending || operation === "FIND"}
                        onClick={() => commit(packet.id)}
                      >
                        Use
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={() => commit(target.barcode)}>
            {operation === "FIND" ? "Close" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
