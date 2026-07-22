import { useCallback, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import AsyncSelect from "react-select/async"
import type { SingleValue, StylesConfig } from "react-select"

type SelectOption = { value: string; label: string }

interface ComponentSummary {
  id: string
  name: string
}

interface PaginatedComponents {
  results: ComponentSummary[]
}

const defaultStyles: StylesConfig<SelectOption, false> = {
  control: (base) => ({
    ...base,
    minHeight: 32,
    backgroundColor: "var(--background)",
    borderColor: "var(--border)",
    "&:hover": { borderColor: "var(--border)" },
  }),
  valueContainer: (base) => ({
    ...base,
    backgroundColor: "var(--background)",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 10000,
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "var(--background)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.15)",
    zIndex: 10000,
  }),
  menuList: (base) => ({
    ...base,
    backgroundColor: "var(--background)",
    padding: 0,
    maxHeight: 260,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "var(--muted)" : "var(--background)",
    color: "var(--foreground)",
  }),
  singleValue: (base) => ({ ...base, color: "var(--foreground)" }),
  input: (base) => ({
    ...base,
    color: "var(--foreground)",
    backgroundColor: "transparent",
  }),
}

export interface ComponentAsyncSelectProps {
  /** Selected component id, or empty string / null when nothing is selected. */
  value: string | null
  /** Called with the selected component id (or empty string when cleared). */
  onChange: (id: string) => void
  placeholder?: string
  isDisabled?: boolean
}

/**
 * Server-backed component picker. Lets the user search components by name/description
 * or paste a component ID — the backend `search` param matches `id__icontains`, so a
 * pasted id resolves to its component. Extracted from the inline AsyncSelect that was
 * duplicated across PurchaseDetailPage and PurchaseRequestsPage.
 */
export function ComponentAsyncSelect({
  value,
  onChange,
  placeholder = "Search by name or paste component ID",
  isDisabled,
}: ComponentAsyncSelectProps) {
  const requestIdRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadComponentOptions = useCallback(
    async (inputValue: string): Promise<SelectOption[]> => {
      const search = inputValue.trim()
      const params = new URLSearchParams()
      params.set("page_size", search ? "25" : "20")
      if (search) {
        params.set("search", search)
      }
      const data = await apiFetch<ComponentSummary[] | PaginatedComponents>(
        `/api/v1/store/components/?${params.toString()}`,
      )
      const list = Array.isArray(data) ? data : data?.results || []
      return list.map((c) => ({ value: c.id, label: c.name }))
    },
    [],
  )

  const loadOptions = useCallback(
    (inputValue: string): Promise<SelectOption[]> =>
      new Promise((resolve) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        const requestId = ++requestIdRef.current
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null
          loadComponentOptions(inputValue).then((options) => {
            if (requestId === requestIdRef.current) {
              resolve(options)
            }
          })
        }, 300)
      }),
    [loadComponentOptions],
  )

  // Resolve the label for a preselected id so it shows a name, not the raw id.
  const { data: selectedDetail } = useQuery<ComponentSummary>({
    queryKey: ["component-async-select-label", value],
    queryFn: () => apiFetch<ComponentSummary>(`/api/v1/store/component/${value}/`),
    enabled: Boolean(value),
    staleTime: 60_000,
  })

  return (
    <AsyncSelect<SelectOption>
      loadOptions={loadOptions}
      defaultOptions
      value={value ? { value, label: selectedDetail?.name ?? value } : null}
      onChange={(option: SingleValue<SelectOption>) => onChange(option?.value || "")}
      placeholder={placeholder}
      classNamePrefix="rs"
      isSearchable
      styles={defaultStyles}
      isDisabled={isDisabled}
      menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
      menuPosition="fixed"
    />
  )
}
