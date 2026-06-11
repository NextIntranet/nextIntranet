import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, getApiConfig, tokenStorage } from "@nextintranet/core"
import Select, { type MultiValue, type StylesConfig } from "react-select"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LabelDesigner } from "@/components/label-designer/LabelDesigner"
import { cn } from "@/lib/utils"
import { LABEL_FORMATS, fetchLabelTemplates } from "@/lib/printing"
import type { LabelFormatOption, LabelTargetType, LabelTemplate } from "@/lib/printing"

const selectClassName = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
)

const formatSelectStyles: StylesConfig<LabelFormatOption, true> = {
  control: (base) => ({
    ...base,
    minHeight: "36px",
    borderColor: "hsl(var(--input))",
    boxShadow: "none",
    ":hover": { borderColor: "hsl(var(--input))" },
    backgroundColor: "hsl(var(--background))",
  }),
  menu: (base) => ({
    ...base,
    zIndex: 20,
    backgroundColor: "hsl(var(--background))",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused
      ? "hsl(var(--accent))"
      : "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: "hsl(var(--muted))",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
  }),
  multiValueRemove: (base) => ({
    ...base,
    ":hover": {
      backgroundColor: "hsl(var(--accent))",
      color: "hsl(var(--foreground))",
    },
  }),
  placeholder: (base) => ({
    ...base,
    color: "hsl(var(--muted-foreground))",
  }),
}

const LABEL_TYPES: Array<{ value: LabelTargetType; label: string }> = [
  { value: "packet", label: "Packet" },
  { value: "location", label: "Location" },
  { value: "component", label: "Component" },
]

const NEW_TEMPLATE_DEFINITION = {
  version: 1,
  canvas: { width_mm: 66.04, height_mm: 38.1 },
  elements: [
    {
      id: "title",
      type: "text",
      x: 2,
      y: 2,
      w: 62,
      h: 6,
      content: "New label",
      font_size: 12,
      bold: true,
    },
  ],
}

interface EditorState {
  id: string | null
  name: string
  label_type: LabelTargetType
  enabled: boolean
  is_default: boolean
  supported_formats: string[]
  definitionText: string
}

interface UserMe {
  is_staff?: boolean
  is_superuser?: boolean
}

const editorStateFromTemplate = (template: LabelTemplate): EditorState => ({
  id: template.id,
  name: template.name,
  label_type: template.label_type,
  enabled: template.enabled,
  is_default: template.is_default,
  supported_formats: [...template.supported_formats],
  definitionText: JSON.stringify(template.definition, null, 2),
})

const emptyEditorState = (): EditorState => ({
  id: null,
  name: "",
  label_type: "packet",
  enabled: true,
  is_default: false,
  supported_formats: ["single"],
  definitionText: JSON.stringify(NEW_TEMPLATE_DEFINITION, null, 2),
})

export function LabelTemplatesPage() {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [viewMode, setViewMode] = useState<"designer" | "json">("designer")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewErrors, setPreviewErrors] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewGenerationRef = useRef(0)

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })
  const canEdit = Boolean(me?.is_staff || me?.is_superuser)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["label-templates"],
    queryFn: fetchLabelTemplates,
  })

  const parsedDefinition = useMemo(() => {
    if (!editor) {
      return { value: null as Record<string, unknown> | null, error: null as string | null }
    }
    try {
      const value = JSON.parse(editor.definitionText) as Record<string, unknown>
      return { value, error: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON"
      return { value: null, error: message }
    }
  }, [editor])

  // Debounced live PDF preview of the current definition.
  useEffect(() => {
    if (!editor || !parsedDefinition.value) {
      return
    }
    const generation = ++previewGenerationRef.current
    const definition = parsedDefinition.value
    const labelType = editor.label_type
    const timer = setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const token = tokenStorage.getToken()
        const response = await fetch(
          `${getApiConfig().baseUrl}/api/v1/print/template/preview/`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ definition, label_type: labelType }),
          },
        )
        if (generation !== previewGenerationRef.current) {
          return
        }
        if (!response.ok) {
          let errors = [`Preview failed (${response.status}).`]
          try {
            const data = (await response.json()) as { errors?: string[] }
            if (Array.isArray(data.errors) && data.errors.length) {
              errors = data.errors
            }
          } catch {
            // Keep generic message.
          }
          setPreviewErrors(errors)
          return
        }
        const blob = await response.blob()
        if (generation !== previewGenerationRef.current) {
          return
        }
        setPreviewErrors([])
        setPreviewUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current)
          }
          return URL.createObjectURL(blob)
        })
      } catch (error) {
        if (generation === previewGenerationRef.current) {
          const message = error instanceof Error ? error.message : "Unknown error"
          setPreviewErrors([`Preview failed: ${message}`])
        }
      } finally {
        if (generation === previewGenerationRef.current) {
          setPreviewLoading(false)
        }
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [editor, parsedDefinition.value])

  const saveMutation = useMutation({
    mutationFn: async (state: EditorState) => {
      if (!parsedDefinition.value) {
        throw new Error(parsedDefinition.error || "Definition is not valid JSON.")
      }
      const body = JSON.stringify({
        name: state.name.trim(),
        label_type: state.label_type,
        enabled: state.enabled,
        is_default: state.is_default,
        supported_formats: state.supported_formats,
        definition: parsedDefinition.value,
      })
      if (state.id) {
        return apiFetch<LabelTemplate>(`/api/v1/print/template/${state.id}/`, {
          method: "PATCH",
          body,
        })
      }
      return apiFetch<LabelTemplate>("/api/v1/print/template/", {
        method: "POST",
        body,
      })
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["label-templates"] })
      setEditor(editorStateFromTemplate(saved))
      toast.success("Label template saved.")
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to save template: ${message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      apiFetch(`/api/v1/print/template/${templateId}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["label-templates"] })
      setEditor(null)
      toast.success("Label template deleted.")
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to delete template: ${message}`)
    },
  })

  const handleSelect = (template: LabelTemplate) => {
    setEditor(editorStateFromTemplate(template))
  }

  const handleDuplicate = (template: LabelTemplate) => {
    setEditor({
      ...editorStateFromTemplate(template),
      id: null,
      name: `${template.name} (copy)`,
      is_default: false,
    })
  }

  const canSave =
    canEdit &&
    Boolean(editor?.name.trim()) &&
    Boolean(editor?.supported_formats.length) &&
    Boolean(parsedDefinition.value)

  const previewPanel = (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        Preview (sample data)
        {previewLoading && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Updating...
          </span>
        )}
      </span>
      <div className="h-[420px] overflow-hidden rounded-md border border-border bg-muted/30">
        {previewUrl ? (
          <iframe
            src={previewUrl}
            title="Template preview"
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {previewLoading ? "Generating preview..." : "Preview will appear here."}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Label templates</h1>
          <p className="text-sm text-muted-foreground">
            Define label layouts as JSON and restrict them to specific print formats.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setEditor(emptyEditorState())}>
            New template
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="w-full table-fixed">
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/50">
                <TableHead className="h-9 w-[30%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-9 w-[14%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="h-9 w-[28%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Formats
                </TableHead>
                <TableHead className="h-9 w-[14%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-9 w-[14%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-border/40">
                  <TableCell colSpan={5} className="py-6">
                    <div className="space-y-2 px-3">
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-5 w-1/2" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : templates.length ? (
                templates.map((template) => (
                  <TableRow
                    key={template.id}
                    className={cn(
                      "border-border/40",
                      editor?.id === template.id && "bg-muted/30",
                    )}
                  >
                    <TableCell className="h-9 px-3 text-sm">
                      <button
                        type="button"
                        onClick={() => handleSelect(template)}
                        className="text-left font-medium text-primary hover:underline"
                      >
                        {template.name}
                      </button>
                      {template.is_default && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          Default
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {template.label_type}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {template.supported_formats.join(", ")}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {template.enabled ? "Enabled" : "Disabled"}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm">
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDuplicate(template)}
                        >
                          Duplicate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-border/40">
                  <TableCell colSpan={5} className="py-6 px-3 text-sm text-muted-foreground">
                    No label templates defined yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editor && (
        <Card>
          <CardHeader>
            <CardTitle>{editor.id ? `Edit: ${editor.name}` : "New template"}</CardTitle>
            <CardDescription>
              Edit the JSON definition; the preview updates automatically with sample data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="template-name">
                  Name
                </label>
                <Input
                  id="template-name"
                  value={editor.name}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                  placeholder="Packet - A4 sheet"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="template-type">
                  Label type
                </label>
                <select
                  id="template-type"
                  className={selectClassName}
                  value={editor.label_type}
                  onChange={(event) =>
                    setEditor({ ...editor, label_type: event.target.value as LabelTargetType })
                  }
                  disabled={!canEdit}
                >
                  {LABEL_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Supported formats</span>
                <Select
                  isMulti
                  classNamePrefix="rs"
                  styles={formatSelectStyles}
                  options={LABEL_FORMATS}
                  value={LABEL_FORMATS.filter((option) =>
                    editor.supported_formats.includes(option.value),
                  )}
                  onChange={(value: MultiValue<LabelFormatOption>) =>
                    setEditor({
                      ...editor,
                      supported_formats: value.map((option) => option.value),
                    })
                  }
                  placeholder="Select formats"
                  isDisabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="template-enabled"
                    checked={editor.enabled}
                    onCheckedChange={(value) =>
                      setEditor({ ...editor, enabled: Boolean(value) })
                    }
                    disabled={!canEdit}
                  />
                  <label htmlFor="template-enabled" className="text-sm text-muted-foreground">
                    Enabled
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="template-default"
                    checked={editor.is_default}
                    onCheckedChange={(value) =>
                      setEditor({ ...editor, is_default: Boolean(value) })
                    }
                    disabled={!canEdit}
                  />
                  <label htmlFor="template-default" className="text-sm text-muted-foreground">
                    Default for this label type
                  </label>
                </div>
              </div>
            </div>

            <div className="flex w-fit items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
              <Button
                size="sm"
                variant={viewMode === "designer" ? "secondary" : "ghost"}
                className="h-7"
                onClick={() => setViewMode("designer")}
              >
                Designer
              </Button>
              <Button
                size="sm"
                variant={viewMode === "json" ? "secondary" : "ghost"}
                className="h-7"
                onClick={() => setViewMode("json")}
              >
                JSON
              </Button>
            </div>

            {viewMode === "designer" ? (
              <div className="space-y-4">
                {parsedDefinition.value ? (
                  <LabelDesigner
                    definition={parsedDefinition.value}
                    labelType={editor.label_type}
                    readOnly={!canEdit}
                    onChange={(definition) =>
                      setEditor({
                        ...editor,
                        definitionText: JSON.stringify(definition, null, 2),
                      })
                    }
                  />
                ) : (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                    The JSON definition is invalid ({parsedDefinition.error}). Fix it in the
                    JSON view before using the designer.
                  </div>
                )}
                {previewErrors.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-destructive">
                    {previewErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
                {previewPanel}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    className="text-sm font-medium text-foreground"
                    htmlFor="template-definition"
                  >
                    Definition (JSON)
                  </label>
                  <textarea
                    id="template-definition"
                    value={editor.definitionText}
                    onChange={(event) =>
                      setEditor({ ...editor, definitionText: event.target.value })
                    }
                    spellCheck={false}
                    readOnly={!canEdit}
                    className={cn(
                      "h-[420px] w-full resize-y rounded-md border border-input bg-background p-3",
                      "font-mono text-xs ring-offset-background",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  />
                  {parsedDefinition.error ? (
                    <p className="text-xs text-destructive">JSON error: {parsedDefinition.error}</p>
                  ) : previewErrors.length ? (
                    <ul className="space-y-0.5 text-xs text-destructive">
                      {previewErrors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {previewPanel}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {canEdit && editor.id && (
                <Button
                  variant="outline"
                  onClick={() => editor.id && deleteMutation.mutate(editor.id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditor(null)}>
                Close
              </Button>
              {canEdit && (
                <Button
                  onClick={() => editor && saveMutation.mutate(editor)}
                  disabled={!canSave || saveMutation.isPending}
                >
                  {saveMutation.isPending ? "Saving..." : editor.id ? "Save changes" : "Create template"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
