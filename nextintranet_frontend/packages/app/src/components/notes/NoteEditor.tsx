import { KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { AtSign, Hash, Loader2, Paperclip, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NoteBody } from "./NoteBody"
import { mentionToken, type MentionKind } from "./mentions"
import { formatFileSize, type UserBrief } from "./types"

type Trigger = { char: "@" | "#"; query: string; start: number }
type Suggestion = { kind: MentionKind; id: string | number; label: string; hint?: string }

const TRIGGER_RE = /(^|[\s(])([@#])([^\s@#[\]()]{0,40})$/

const findTrigger = (text: string, caret: number): Trigger | null => {
  const match = TRIGGER_RE.exec(text.slice(0, caret))
  if (!match) return null
  return { char: match[2] as "@" | "#", query: match[3], start: caret - match[3].length - 1 }
}

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function useMentionSuggestions(trigger: Trigger | null) {
  const query = useDebounced(trigger ? `${trigger.char}${trigger.query}` : "")
  const char = query.charAt(0)
  const term = query.slice(1)
  return useQuery<Suggestion[]>({
    queryKey: ["mention-suggestions", query],
    enabled: char === "@" || (char === "#" && term.length >= 1),
    staleTime: 30_000,
    queryFn: async () => {
      if (char === "@") {
        const users = await apiFetch<UserBrief[]>(`/api/v1/core/users/lookup/?search=${encodeURIComponent(term)}`)
        return users.map((user) => ({ kind: "user", id: user.id, label: user.display_name, hint: user.username }))
      }
      const data = await apiFetch<{ results: Array<{ id: string; name: string; description?: string | null }> }>(
        `/api/v1/store/components/?search=${encodeURIComponent(term)}&page_size=8`,
      )
      return data.results.map((item) => ({
        kind: "component",
        id: item.id,
        label: item.name,
        hint: item.description?.split("\n")[0]?.slice(0, 60) || undefined,
      }))
    },
  })
}

export interface NoteEditorProps {
  initialValue?: string
  submitLabel?: string
  placeholder?: string
  allowFiles?: boolean
  busy?: boolean
  autoFocus?: boolean
  onSubmit: (body: string, files: File[]) => Promise<unknown> | void
  onCancel?: () => void
}

/** Markdown composer with Write/Preview, @user and #component autocomplete and file picking. */
export function NoteEditor({
  initialValue = "",
  submitLabel = "Add note",
  placeholder = "Write a note… Markdown supported. @ mentions a user, # a component.",
  allowFiles = true,
  busy = false,
  autoFocus = false,
  onSubmit,
  onCancel,
}: NoteEditorProps) {
  const [value, setValue] = useState(initialValue)
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState(false)
  const [trigger, setTrigger] = useState<Trigger | null>(null)
  const [highlight, setHighlight] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Caret to restore right after the next render (programmatic edits reset it to the end).
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    const element = textareaRef.current
    if (pendingCaret.current === null || !element) return
    element.focus()
    element.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  }, [value])

  const { data: suggestions = [], isFetching } = useMentionSuggestions(trigger)
  const visibleSuggestions = useMemo(() => (trigger ? suggestions : []), [trigger, suggestions])

  useEffect(() => setHighlight(0), [trigger?.char, trigger?.query])

  const updateTrigger = () => {
    const element = textareaRef.current
    if (!element) return
    setTrigger(findTrigger(element.value, element.selectionStart ?? element.value.length))
  }

  const insertMention = (suggestion: Suggestion) => {
    if (!trigger) return
    const end = trigger.start + 1 + trigger.query.length
    const token = `${mentionToken(suggestion.kind, suggestion.id, suggestion.label)} `
    pendingCaret.current = trigger.start + token.length
    setValue(value.slice(0, trigger.start) + token + value.slice(end))
    setTrigger(null)
  }

  const submit = async () => {
    if (!value.trim() || busy) return
    await onSubmit(value, files)
    setValue("")
    setFiles([])
    setPreview(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (visibleSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setHighlight((index) => (index + 1) % visibleSuggestions.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setHighlight((index) => (index - 1 + visibleSuggestions.length) % visibleSuggestions.length)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        insertMention(visibleSuggestions[highlight])
        return
      }
    }
    if (event.key === "Escape" && trigger) {
      event.preventDefault()
      setTrigger(null)
      return
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void submit()
    }
  }

  const insertTrigger = (char: "@" | "#") => {
    const caret = preview ? value.length : textareaRef.current?.selectionStart ?? value.length
    const needsSpace = caret > 0 && !/\s/.test(value.charAt(caret - 1))
    const insert = `${needsSpace ? " " : ""}${char}`
    const position = caret + insert.length
    pendingCaret.current = position
    setPreview(false)
    setValue(value.slice(0, caret) + insert + value.slice(caret))
    setTrigger({ char, query: "", start: position - 1 })
  }

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <Button type="button" variant={preview ? "ghost" : "secondary"} size="sm" className="h-7" onClick={() => setPreview(false)}>
          Write
        </Button>
        <Button type="button" variant={preview ? "secondary" : "ghost"} size="sm" className="h-7" onClick={() => setPreview(true)}>
          Preview
        </Button>
        <div className="ml-auto flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Mention a user" onClick={() => insertTrigger("@")}>
            <AtSign className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Mention a component" onClick={() => insertTrigger("#")}>
            <Hash className="h-4 w-4" />
          </Button>
          {allowFiles ? (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Attach files" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative">
        {preview ? (
          <div className="min-h-24 px-3 py-2">
            {value.trim() ? <NoteBody body={value} /> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            autoFocus={autoFocus}
            onChange={(event) => {
              setValue(event.target.value)
              setTrigger(findTrigger(event.target.value, event.target.selectionStart ?? event.target.value.length))
            }}
            onClick={updateTrigger}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setTrigger(null), 150)}
            placeholder={placeholder}
            rows={4}
            className="block min-h-24 w-full resize-y bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        )}

        {trigger && !preview ? (
          <div className="absolute left-2 right-2 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
              {trigger.char === "@" ? <AtSign className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
              {trigger.char === "@" ? "Mention a user" : trigger.query ? "Mention a component" : "Type to search components"}
              {isFetching ? <Loader2 className="ml-auto h-3 w-3 animate-spin" /> : null}
            </div>
            {visibleSuggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.kind}-${suggestion.id}`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  insertMention(suggestion)
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm",
                  index === highlight ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="truncate font-medium">{suggestion.label}</span>
                {suggestion.hint ? <span className="truncate text-xs text-muted-foreground">{suggestion.hint}</span> : null}
              </button>
            ))}
            {!isFetching && visibleSuggestions.length === 0 && (trigger.char === "@" || trigger.query) ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {files.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-48 truncate">{file.name}</span>
              <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
              <button type="button" className="ml-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remove ${file.name}`} onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? [])
          setFiles((prev) => [...prev, ...picked])
          event.target.value = ""
        }}
      />

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl+Enter to submit</span>
        <div className="ml-auto flex gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy || !value.trim()} onClick={() => void submit()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
