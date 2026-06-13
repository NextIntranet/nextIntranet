import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"

export interface HotkeyBinding {
  /**
   * Key spec: single key ("f", "?"), modifier combo ("ctrl+k"), or a
   * space-separated two-key sequence ("g i"). Sequences must not use
   * modifiers.
   */
  keys: string
  description: string
  /** Help-dialog group; "Global" is listed first. */
  group: string
  handler: () => void
  /** Fire even while an input/textarea has focus (combos with modifiers). */
  allowInInput?: boolean
}

interface RegistryEntry extends HotkeyBinding {
  id: number
}

interface HotkeysContextValue {
  register: (bindings: HotkeyBinding[]) => () => void
  entries: RegistryEntry[]
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
}

const HotkeysContext = createContext<HotkeysContextValue | null>(null)

const SEQUENCE_TIMEOUT_MS = 1000

const isTextInputTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  if (!element) {
    return false
  }
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable
  )
}

interface ParsedStep {
  key: string
  ctrl: boolean
  alt: boolean
  meta: boolean
  shift: boolean
}

const parseStep = (step: string): ParsedStep => {
  const parts = step.split("+")
  const key = parts[parts.length - 1].toLowerCase()
  const mods = parts.slice(0, -1).map((part) => part.toLowerCase())
  return {
    key,
    ctrl: mods.includes("ctrl"),
    alt: mods.includes("alt"),
    meta: mods.includes("meta") || mods.includes("cmd"),
    shift: mods.includes("shift"),
  }
}

const eventMatchesStep = (event: KeyboardEvent, step: ParsedStep) => {
  if (event.key.toLowerCase() !== step.key) {
    return false
  }
  // Shift is only checked when requested — keys like "?" already imply it
  // and its placement differs across keyboard layouts.
  return (
    event.ctrlKey === step.ctrl &&
    event.altKey === step.alt &&
    event.metaKey === step.meta &&
    (!step.shift || event.shiftKey)
  )
}

const hasModifiers = (event: KeyboardEvent) =>
  event.ctrlKey || event.altKey || event.metaKey

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<RegistryEntry[]>([])
  const [helpOpen, setHelpOpen] = useState(false)
  const entriesRef = useRef<RegistryEntry[]>([])
  entriesRef.current = entries
  const nextIdRef = useRef(1)
  const pendingKeyRef = useRef<string | null>(null)
  const pendingTimerRef = useRef<number | null>(null)

  const register = useCallback((bindings: HotkeyBinding[]) => {
    const registered: RegistryEntry[] = bindings.map((binding) => ({
      ...binding,
      id: nextIdRef.current++,
    }))
    setEntries((current) => [...current, ...registered])
    return () => {
      const ids = new Set(registered.map((entry) => entry.id))
      setEntries((current) => current.filter((entry) => !ids.has(entry.id)))
    }
  }, [])

  useEffect(() => {
    const clearPending = () => {
      pendingKeyRef.current = null
      if (pendingTimerRef.current != null) {
        window.clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) {
        return
      }
      const key = event.key.toLowerCase()
      if (["control", "alt", "meta", "shift"].includes(key)) {
        return
      }
      const inInput = isTextInputTarget(event.target)
      const candidates = entriesRef.current.filter(
        (entry) => !inInput || entry.allowInInput,
      )

      // Finish a pending two-key sequence first.
      if (pendingKeyRef.current && !hasModifiers(event)) {
        const sequence = `${pendingKeyRef.current} ${key}`
        clearPending()
        const match = candidates.find((entry) => entry.keys.toLowerCase() === sequence)
        if (match) {
          event.preventDefault()
          match.handler()
          return
        }
      } else if (pendingKeyRef.current) {
        clearPending()
      }

      // Direct single-step matches (including modifier combos).
      const direct = candidates.find((entry) => {
        if (entry.keys.includes(" ")) {
          return false
        }
        return eventMatchesStep(event, parseStep(entry.keys))
      })
      if (direct) {
        event.preventDefault()
        direct.handler()
        return
      }

      // Start of a sequence?
      if (!hasModifiers(event)) {
        const startsSequence = candidates.some(
          (entry) =>
            entry.keys.includes(" ") &&
            entry.keys.toLowerCase().split(" ")[0] === key,
        )
        if (startsSequence) {
          event.preventDefault()
          pendingKeyRef.current = key
          pendingTimerRef.current = window.setTimeout(clearPending, SEQUENCE_TIMEOUT_MS)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      clearPending()
    }
  }, [])

  const value = useMemo(
    () => ({ register, entries, helpOpen, setHelpOpen }),
    [register, entries, helpOpen],
  )

  return <HotkeysContext.Provider value={value}>{children}</HotkeysContext.Provider>
}

const useHotkeysContext = () => {
  const context = useContext(HotkeysContext)
  if (!context) {
    throw new Error("Hotkeys hooks must be used within a HotkeysProvider.")
  }
  return context
}

/**
 * Register shortcuts for the lifetime of the calling component. Handlers
 * always see the latest render's closures.
 */
export function useHotkeys(bindings: HotkeyBinding[]) {
  const { register } = useHotkeysContext()
  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings
  const signature = bindings
    .map((binding) => `${binding.keys}|${binding.description}|${binding.group}`)
    .join(";")

  useEffect(() => {
    const wrapped = bindingsRef.current.map((binding, index) => ({
      ...binding,
      handler: () => bindingsRef.current[index]?.handler(),
    }))
    return register(wrapped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, signature])
}

export function useHotkeysHelp() {
  const { entries, helpOpen, setHelpOpen } = useHotkeysContext()

  const groups = useMemo(() => {
    const byGroup = new Map<string, RegistryEntry[]>()
    for (const entry of entries) {
      const list = byGroup.get(entry.group) ?? []
      list.push(entry)
      byGroup.set(entry.group, list)
    }
    return [...byGroup.entries()]
      .sort(([a], [b]) => {
        if (a === "Global") return -1
        if (b === "Global") return 1
        return a.localeCompare(b)
      })
      .map(([group, items]) => ({ group, items }))
  }, [entries])

  return { groups, helpOpen, setHelpOpen }
}
