import { apiFetch, getApiConfig, tokenStorage } from "@nextintranet/core"

export type LabelTargetType = "packet" | "location" | "component"

export interface LabelFormatOption {
  value: string
  label: string
}

export const LABEL_FORMATS: LabelFormatOption[] = [
  { value: "single", label: "Single label (label printer)" },
  { value: "a4_2x7", label: "A4 sheet 2 x 7" },
  { value: "a4_3x7", label: "A4 sheet 3 x 7" },
  { value: "a4_4x10", label: "A4 sheet 4 x 10" },
]

export interface LabelTemplate {
  id: string
  name: string
  label_type: LabelTargetType
  enabled: boolean
  supported_formats: string[]
  is_default: boolean
  definition: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PrintRenderJob {
  id: string
  status: "queued" | "processing" | "ready" | "failed"
  file_url?: string | null
  error?: string | null
}

export const resolveFileUrl = (fileUrl: string) => {
  if (fileUrl.startsWith("http")) {
    return fileUrl
  }
  const apiBaseUrl = getApiConfig().baseUrl
  if (!apiBaseUrl) {
    return fileUrl
  }
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl
  const suffix = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`
  return `${base}${suffix}`
}

export const isInternalUrl = (fileUrl: string) => {
  if (!fileUrl.startsWith("http")) {
    return true
  }
  const apiBaseUrl = getApiConfig().baseUrl
  if (!apiBaseUrl) {
    return false
  }
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl
  return fileUrl.startsWith(base)
}

export const pollRenderJob = async (jobId: string) => {
  const maxAttempts = 24
  const delayMs = 1000
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const job = await apiFetch<PrintRenderJob>(`/api/v1/print/render/${jobId}/`)
    if (job.status === "ready" && job.file_url) {
      return job.file_url
    }
    if (job.status === "failed") {
      throw new Error(job.error || "Print render failed.")
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error("Print render timed out.")
}

/**
 * Fetch a (possibly auth-protected) file URL and return it as a Blob.
 */
export const fetchFileBlob = async (fileUrl: string) => {
  const resolvedUrl = resolveFileUrl(fileUrl)
  const token = tokenStorage.getToken()
  const headers =
    token && isInternalUrl(fileUrl) ? { Authorization: `Bearer ${token}` } : undefined
  const response = await fetch(resolvedUrl, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch file (${response.status}).`)
  }
  return response.blob()
}

export const fetchLabelTemplates = () =>
  apiFetch<LabelTemplate[]>("/api/v1/print/template/")

export const templatesForFormat = (
  templates: LabelTemplate[],
  format: string,
  labelType?: LabelTargetType,
) =>
  templates.filter(
    (template) =>
      template.enabled &&
      template.supported_formats.includes(format) &&
      (!labelType || template.label_type === labelType),
  )
