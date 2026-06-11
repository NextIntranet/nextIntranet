import { useRef } from "react"
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react"
import { Image as ImageIcon, QrCode } from "lucide-react"

import { cn } from "@/lib/utils"
import type { LabelTargetType } from "@/lib/printing"
import { resolvePlaceholders, rgbToCss, roundMm } from "./types"
import type { LabelDefinition, LabelElement } from "./types"

const PT_TO_MM = 0.352778
const SNAP_MM = 0.5

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

interface DragState {
  index: number
  mode: "move" | ResizeHandle
  startClientX: number
  startClientY: number
  start: { x: number; y: number; w: number; h: number }
}

const HANDLES: Array<{ handle: ResizeHandle; className: string; cursor: string }> = [
  { handle: "nw", className: "-left-1 -top-1", cursor: "nwse-resize" },
  { handle: "n", className: "left-1/2 -top-1 -translate-x-1/2", cursor: "ns-resize" },
  { handle: "ne", className: "-right-1 -top-1", cursor: "nesw-resize" },
  { handle: "e", className: "-right-1 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { handle: "se", className: "-right-1 -bottom-1", cursor: "nwse-resize" },
  { handle: "s", className: "left-1/2 -bottom-1 -translate-x-1/2", cursor: "ns-resize" },
  { handle: "sw", className: "-left-1 -bottom-1", cursor: "nesw-resize" },
  { handle: "w", className: "-left-1 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
]

const snap = (value: number) => roundMm(Math.round(value / SNAP_MM) * SNAP_MM)

interface DesignerCanvasProps {
  definition: LabelDefinition
  labelType: LabelTargetType
  pxPerMm: number
  selectedIndex: number | null
  readOnly?: boolean
  onSelect: (index: number | null) => void
  onUpdateElement: (index: number, patch: Partial<LabelElement>) => void
  onDeleteElement: (index: number) => void
}

export function DesignerCanvas({
  definition,
  labelType,
  pxPerMm,
  selectedIndex,
  readOnly,
  onSelect,
  onUpdateElement,
  onDeleteElement,
}: DesignerCanvasProps) {
  const dragRef = useRef<DragState | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const { canvas, elements } = definition

  const startDrag = (
    event: PointerEvent<HTMLDivElement>,
    index: number,
    mode: DragState["mode"],
  ) => {
    if (readOnly) {
      onSelect(index)
      return
    }
    event.stopPropagation()
    // preventDefault suppresses the browser's focus-on-pointerdown, so focus
    // the canvas explicitly to keep arrow-key nudging working.
    event.preventDefault()
    wrapperRef.current?.focus()
    onSelect(index)
    const element = elements[index]
    dragRef.current = {
      index,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      start: { x: element.x, y: element.y, w: element.w, h: element.h },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const element = elements[drag.index]
    if (!element) {
      return
    }
    const dx = (event.clientX - drag.startClientX) / pxPerMm
    const dy = (event.clientY - drag.startClientY) / pxPerMm
    const { start } = drag
    const allowZeroSize = element.type === "line"
    const minSize = allowZeroSize ? 0 : 1

    if (drag.mode === "move") {
      onUpdateElement(drag.index, {
        x: snap(Math.max(0, Math.min(start.x + dx, canvas.width_mm - Math.max(start.w, 0)))),
        y: snap(Math.max(0, Math.min(start.y + dy, canvas.height_mm - Math.max(start.h, 0)))),
      })
      return
    }

    const patch: Partial<LabelElement> = {}
    if (drag.mode.includes("e")) {
      patch.w = snap(Math.max(minSize, start.w + dx))
    }
    if (drag.mode.includes("s")) {
      patch.h = snap(Math.max(minSize, start.h + dy))
    }
    if (drag.mode.includes("w")) {
      const w = snap(Math.max(minSize, start.w - dx))
      patch.w = w
      patch.x = snap(start.x + start.w - w)
    }
    if (drag.mode.includes("n")) {
      const h = snap(Math.max(minSize, start.h - dy))
      patch.h = h
      patch.y = snap(start.y + start.h - h)
    }
    onUpdateElement(drag.index, patch)
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly || selectedIndex === null || !elements[selectedIndex]) {
      return
    }
    const step = event.shiftKey ? 2 : SNAP_MM
    const element = elements[selectedIndex]
    const moves: Record<string, Partial<LabelElement>> = {
      ArrowLeft: { x: roundMm(Math.max(0, element.x - step)) },
      ArrowRight: { x: roundMm(element.x + step) },
      ArrowUp: { y: roundMm(Math.max(0, element.y - step)) },
      ArrowDown: { y: roundMm(element.y + step) },
    }
    if (event.key in moves) {
      event.preventDefault()
      onUpdateElement(selectedIndex, moves[event.key])
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      onDeleteElement(selectedIndex)
    }
  }

  const renderElementContent = (element: LabelElement) => {
    switch (element.type) {
      case "text": {
        const fontSizePx = (element.font_size ?? 10) * PT_TO_MM * pxPerMm
        const align =
          element.align === "C" ? "center" : element.align === "R" ? "right" : "left"
        return (
          <div
            className="h-full w-full overflow-hidden leading-tight"
            style={{
              fontSize: `${fontSizePx}px`,
              fontWeight: element.bold ? 700 : 400,
              textAlign: align as CSSProperties["textAlign"],
              color: rgbToCss(element.color),
              whiteSpace: element.multiline ? "pre-wrap" : "nowrap",
              wordBreak: element.multiline ? "break-word" : undefined,
            }}
          >
            {resolvePlaceholders(element.content ?? "", labelType)}
          </div>
        )
      }
      case "barcode": {
        const sizePx = Math.min(element.w, element.h) * pxPerMm || Math.max(element.w, element.h) * pxPerMm
        return (
          <div
            className="flex items-center justify-center rounded-sm bg-muted text-muted-foreground"
            style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
          >
            <QrCode style={{ width: sizePx * 0.7, height: sizePx * 0.7 }} />
          </div>
        )
      }
      case "logo":
        return (
          <div className="flex h-full w-full items-center justify-center rounded-sm border border-dashed border-muted-foreground/50 text-muted-foreground">
            <ImageIcon className="h-2/3 w-2/3" />
          </div>
        )
      case "rect":
        return (
          <div
            className="h-full w-full"
            style={{
              border: `${Math.max((element.line_width ?? 0.3) * pxPerMm, 1)}px solid ${rgbToCss(element.color, "rgb(100,100,100)")}`,
              backgroundColor: element.fill
                ? rgbToCss(element.color, "rgb(245,245,245)")
                : undefined,
            }}
          />
        )
      case "line": {
        const widthPx = Math.max(Math.abs(element.w) * pxPerMm, 1)
        const heightPx = Math.max(Math.abs(element.h) * pxPerMm, 1)
        const x1 = element.w >= 0 ? 0 : widthPx
        const y1 = element.h >= 0 ? 0 : heightPx
        return (
          <svg width={widthPx} height={heightPx} className="overflow-visible">
            <line
              x1={x1}
              y1={y1}
              x2={widthPx - x1}
              y2={heightPx - y1}
              stroke={rgbToCss(element.color, "rgb(100,100,100)")}
              strokeWidth={Math.max((element.line_width ?? 0.3) * pxPerMm, 1)}
            />
          </svg>
        )
      }
    }
  }

  return (
    <div
      ref={wrapperRef}
      role="application"
      tabIndex={0}
      className="relative cursor-default rounded-sm bg-white shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        width: `${canvas.width_mm * pxPerMm}px`,
        height: `${canvas.height_mm * pxPerMm}px`,
        backgroundImage:
          "linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px)," +
          "linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)",
        backgroundSize: `${5 * pxPerMm}px ${5 * pxPerMm}px`,
      }}
      onPointerDown={() => onSelect(null)}
      onKeyDown={handleKeyDown}
    >
      {elements.map((element, index) => {
        // Lines can have negative w/h; position the box at the top-left of
        // the bounding rectangle so the SVG line stays visible.
        const left = (element.w < 0 ? element.x + element.w : element.x) * pxPerMm
        const top = (element.h < 0 ? element.y + element.h : element.y) * pxPerMm
        const width = Math.max(Math.abs(element.w) * pxPerMm, 2)
        const height = Math.max(Math.abs(element.h) * pxPerMm, 2)
        const selected = index === selectedIndex
        return (
          <div
            key={element.id ?? index}
            className={cn(
              "absolute",
              !readOnly && "cursor-move",
              selected
                ? "ring-2 ring-primary"
                : "hover:ring-1 hover:ring-primary/40",
            )}
            style={{ left, top, width, height }}
            onPointerDown={(event) => startDrag(event, index, "move")}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {renderElementContent(element)}
            {selected &&
              !readOnly &&
              HANDLES.map(({ handle, className, cursor }) => (
                <div
                  key={handle}
                  className={cn(
                    "absolute z-10 h-2 w-2 rounded-[2px] border border-primary bg-background",
                    className,
                  )}
                  style={{ cursor }}
                  onPointerDown={(event) => startDrag(event, index, handle)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              ))}
          </div>
        )
      })}
    </div>
  )
}
