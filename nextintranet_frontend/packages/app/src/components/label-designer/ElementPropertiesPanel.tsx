import { useRef } from "react"
import type { ChangeEvent } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { LabelTargetType } from "@/lib/printing"
import { ELEMENT_TYPE_LABELS, PLACEHOLDERS, hexToRgb, rgbToHex } from "./types"
import type { LabelElement } from "./types"

const selectClassName = cn(
  "flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
)

const BARCODE_TYPES = ["datamatrix", "qrcode", "code128"]

interface ElementPropertiesPanelProps {
  element: LabelElement
  labelType: LabelTargetType
  readOnly?: boolean
  onChange: (patch: Partial<LabelElement>) => void
}

export function ElementPropertiesPanel({
  element,
  labelType,
  readOnly,
  onChange,
}: ElementPropertiesPanelProps) {
  const contentRef = useRef<HTMLTextAreaElement | null>(null)

  const numberChange =
    (key: keyof LabelElement, fallback = 0) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.valueAsNumber
      onChange({ [key]: Number.isFinite(value) ? value : fallback })
    }

  const insertPlaceholder = (placeholder: string) => {
    const textarea = contentRef.current
    const content = element.content ?? ""
    if (!textarea) {
      onChange({ content: content + placeholder })
      return
    }
    const start = textarea.selectionStart ?? content.length
    const end = textarea.selectionEnd ?? content.length
    onChange({ content: content.slice(0, start) + placeholder + content.slice(end) })
    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + placeholder.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  const numberField = (label: string, key: keyof LabelElement, step = 0.5) => (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="number"
        step={step}
        className="h-8"
        value={(element[key] as number | undefined) ?? 0}
        onChange={numberChange(key)}
        disabled={readOnly}
      />
    </div>
  )

  const checkboxField = (label: string, key: keyof LabelElement) => (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`element-${String(key)}`}
        checked={Boolean(element[key])}
        onCheckedChange={(value) => onChange({ [key]: Boolean(value) })}
        disabled={readOnly}
      />
      <label htmlFor={`element-${String(key)}`} className="text-sm text-muted-foreground">
        {label}
      </label>
    </div>
  )

  const colorField = (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">Color</label>
      <input
        type="color"
        className="h-8 w-full cursor-pointer rounded-md border border-input bg-background p-0.5"
        value={rgbToHex(element.color)}
        onChange={(event) => onChange({ color: hexToRgb(event.target.value) })}
        disabled={readOnly}
      />
    </div>
  )

  const placeholderMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={readOnly}>
          Insert variable
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PLACEHOLDERS[labelType].map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => insertPlaceholder(option.value)}>
            <span className="flex flex-col">
              <span>{option.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{option.value}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-foreground">
        {ELEMENT_TYPE_LABELS[element.type]} properties
      </div>

      <div className="grid grid-cols-4 gap-2">
        {numberField("X (mm)", "x")}
        {numberField("Y (mm)", "y")}
        {numberField("W (mm)", "w")}
        {numberField("H (mm)", "h")}
      </div>

      {(element.type === "text" || element.type === "barcode") && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground" htmlFor="element-content">
              Content
            </label>
            {placeholderMenu}
          </div>
          <textarea
            id="element-content"
            ref={contentRef}
            rows={element.type === "text" ? 3 : 2}
            value={element.content ?? ""}
            onChange={(event) => onChange({ content: event.target.value })}
            readOnly={readOnly}
            spellCheck={false}
            className={cn(
              "w-full resize-y rounded-md border border-input bg-background p-2",
              "font-mono text-xs ring-offset-background",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          />
        </div>
      )}

      {element.type === "text" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {numberField("Font size (pt)", "font_size")}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="element-align">
                Align
              </label>
              <select
                id="element-align"
                className={selectClassName}
                value={element.align ?? "L"}
                onChange={(event) => onChange({ align: event.target.value as "L" | "C" | "R" })}
                disabled={readOnly}
              >
                <option value="L">Left</option>
                <option value="C">Center</option>
                <option value="R">Right</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            {checkboxField("Bold", "bold")}
            {checkboxField("Multiline", "multiline")}
            {checkboxField("Shrink to fit", "fit")}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {numberField("Max chars", "max_chars", 1)}
            {numberField("Line height", "line_height", 0.1)}
            {colorField}
          </div>
        </>
      )}

      {element.type === "barcode" && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="element-barcode-type">
            Barcode type
          </label>
          <select
            id="element-barcode-type"
            className={selectClassName}
            value={element.barcode_type ?? "datamatrix"}
            onChange={(event) => onChange({ barcode_type: event.target.value })}
            disabled={readOnly}
          >
            {BARCODE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      )}

      {(element.type === "line" || element.type === "rect") && (
        <div className="grid grid-cols-2 gap-2">
          {numberField("Line width (mm)", "line_width", 0.1)}
          {colorField}
        </div>
      )}

      {element.type === "rect" && checkboxField("Fill", "fill")}
    </div>
  )
}
