import { useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  Minus,
  Plus,
  QrCode,
  Square,
  Trash2,
  Type,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { LabelTargetType } from "@/lib/printing"
import { DesignerCanvas } from "./DesignerCanvas"
import { ElementPropertiesPanel } from "./ElementPropertiesPanel"
import {
  ELEMENT_TYPE_LABELS,
  createElement,
  normalizeDefinition,
  resolvePlaceholders,
  roundMm,
} from "./types"
import type { LabelDefinition, LabelElement, LabelElementType } from "./types"

const ZOOM_LEVELS = [50, 75, 100, 150, 200]
const BASE_CANVAS_WIDTH_PX = 560

const ADD_BUTTONS: Array<{ type: LabelElementType; icon: typeof Type }> = [
  { type: "text", icon: Type },
  { type: "barcode", icon: QrCode },
  { type: "logo", icon: ImageIcon },
  { type: "line", icon: Minus },
  { type: "rect", icon: Square },
]

const ELEMENT_ICONS: Record<LabelElementType, typeof Type> = {
  text: Type,
  barcode: QrCode,
  logo: ImageIcon,
  line: Minus,
  rect: Square,
}

const elementSummary = (element: LabelElement, labelType: LabelTargetType) => {
  if (element.type === "text" || element.type === "barcode") {
    const resolved = resolvePlaceholders(element.content ?? "", labelType)
    if (resolved.trim()) {
      return resolved
    }
    return element.content ?? ""
  }
  return `${element.w} x ${element.h} mm`
}

interface LabelDesignerProps {
  definition: Record<string, unknown>
  labelType: LabelTargetType
  readOnly?: boolean
  onChange: (definition: LabelDefinition) => void
}

export function LabelDesigner({ definition, labelType, readOnly, onChange }: LabelDesignerProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [zoom, setZoom] = useState(100)

  const normalized = useMemo(() => normalizeDefinition(definition), [definition])
  const { canvas, elements } = normalized

  const basePxPerMm = Math.min(Math.max(BASE_CANVAS_WIDTH_PX / canvas.width_mm, 2), 12)
  const pxPerMm = (basePxPerMm * zoom) / 100

  const selectedElement =
    selectedIndex !== null && selectedIndex < elements.length ? elements[selectedIndex] : null

  const updateElements = (nextElements: LabelElement[]) => {
    onChange({ ...normalized, elements: nextElements })
  }

  const handleAdd = (type: LabelElementType) => {
    const element = createElement(type, canvas, labelType)
    updateElements([...elements, element])
    setSelectedIndex(elements.length)
  }

  const handleUpdateElement = (index: number, patch: Partial<LabelElement>) => {
    updateElements(
      elements.map((element, i) => (i === index ? { ...element, ...patch } : element)),
    )
  }

  const handleDeleteElement = (index: number) => {
    updateElements(elements.filter((_, i) => i !== index))
    setSelectedIndex(null)
  }

  const handleDuplicate = (index: number) => {
    const source = elements[index]
    const copy: LabelElement = {
      ...source,
      id: crypto.randomUUID(),
      x: roundMm(source.x + 2),
      y: roundMm(source.y + 2),
    }
    updateElements([...elements, copy])
    setSelectedIndex(elements.length)
  }

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= elements.length) {
      return
    }
    const next = [...elements]
    ;[next[index], next[target]] = [next[target], next[index]]
    updateElements(next)
    if (selectedIndex === index) {
      setSelectedIndex(target)
    } else if (selectedIndex === target) {
      setSelectedIndex(index)
    }
  }

  const handleCanvasSize = (key: "width_mm" | "height_mm", value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return
    }
    onChange({ ...normalized, canvas: { ...canvas, [key]: value } })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1">
            {ADD_BUTTONS.map(({ type, icon: Icon }) => (
              <Button
                key={type}
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => handleAdd(type)}
              >
                <Plus className="h-3.5 w-3.5" />
                <Icon className="h-3.5 w-3.5" />
                {ELEMENT_TYPE_LABELS[type]}
              </Button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="canvas-width">
              Width (mm)
            </label>
            <Input
              id="canvas-width"
              type="number"
              step={0.1}
              className="h-8 w-24"
              value={canvas.width_mm}
              onChange={(event) => handleCanvasSize("width_mm", event.target.valueAsNumber)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="canvas-height">
              Height (mm)
            </label>
            <Input
              id="canvas-height"
              type="number"
              step={0.1}
              className="h-8 w-24"
              value={canvas.height_mm}
              onChange={(event) => handleCanvasSize("height_mm", event.target.valueAsNumber)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="canvas-zoom">
              Zoom
            </label>
            <select
              id="canvas-zoom"
              className={cn(
                "flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm",
                "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            >
              {ZOOM_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}%
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-auto rounded-md border border-border bg-muted/30 p-6">
          <DesignerCanvas
            definition={normalized}
            labelType={labelType}
            pxPerMm={pxPerMm}
            selectedIndex={selectedIndex}
            readOnly={readOnly}
            onSelect={setSelectedIndex}
            onUpdateElement={handleUpdateElement}
            onDeleteElement={handleDeleteElement}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-border p-3">
            {selectedElement ? (
              <ElementPropertiesPanel
                element={selectedElement}
                labelType={labelType}
                readOnly={readOnly}
                onChange={(patch) =>
                  selectedIndex !== null && handleUpdateElement(selectedIndex, patch)
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select an element on the canvas to edit its properties.
              </p>
            )}
          </div>

          <div className="rounded-md border border-border">
            <div className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
              Elements
            </div>
            {elements.length ? (
              <ul className="max-h-64 divide-y divide-border/60 overflow-auto">
                {elements.map((element, index) => {
                  const Icon = ELEMENT_ICONS[element.type] ?? Square
                  return (
                    <li
                      key={element.id ?? index}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5",
                        index === selectedIndex && "bg-muted/50",
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => setSelectedIndex(index)}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-xs text-foreground">
                          {elementSummary(element, labelType) || ELEMENT_TYPE_LABELS[element.type]}
                        </span>
                      </button>
                      {!readOnly && (
                        <span className="flex shrink-0 items-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleMove(index, -1)}
                            disabled={index === 0}
                            title="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleMove(index, 1)}
                            disabled={index === elements.length - 1}
                            title="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleDuplicate(index)}
                            title="Duplicate"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            onClick={() => handleDeleteElement(index)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No elements yet. Add one from the toolbar.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
