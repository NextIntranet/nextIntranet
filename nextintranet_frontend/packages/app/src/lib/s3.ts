/** Rewrites local MinIO/RustFS URLs (port 9003) to the same-origin `/s3/` proxy. */
export const toSameOriginS3Url = (value: string | null | undefined) => {
  if (!value) return null
  if (typeof window === "undefined") return value
  try {
    const parsed = new URL(value, window.location.origin)
    const isLocalMinio =
      (parsed.hostname === "localhost" || parsed.hostname === window.location.hostname) &&
      parsed.port === "9003"
    if (isLocalMinio) {
      return `/s3${parsed.pathname}${parsed.search}${parsed.hash}`
    }
    return value
  } catch {
    return value
  }
}
