import { apiFetchResponse } from "@nextintranet/core"

const filenameFromDisposition = (header: string | null) => {
  if (!header) return null
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8) return decodeURIComponent(utf8[1])
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1] : null
}

/** Downloads an authenticated API file (e.g. a PDF export) through a temporary blob link. */
export async function downloadAuthed(path: string, fallbackName = "download.pdf") {
  const response = await apiFetchResponse(path, { headers: { Accept: "application/pdf, */*" } })
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = filenameFromDisposition(response.headers.get("Content-Disposition")) || fallbackName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
