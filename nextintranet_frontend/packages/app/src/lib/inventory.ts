import { apiFetch } from "@nextintranet/core"

export interface InventoryStockOperation {
  id: string
  packet: string
  operation_type: string
  reference?: string | null
}

export type PaginatedResponse<T> = {
  count?: number
  next?: string | null
  previous?: string | null
  results: T[]
}

const buildInventoryDescriptionPrefix = (
  absoluteQuantity: number,
  userDescription: string | null,
) => {
  const countNote = `Physical count: ${absoluteQuantity}`
  const trimmed = userDescription?.trim()
  return trimmed ? `${trimmed} | ${countNote}` : countNote
}

export interface PostInventoryOperationParams {
  packet: string
  absoluteQuantity: number
  reference?: string | null
  fast?: boolean
  userDescription?: string | null
}

export const postInventoryOperation = (params: PostInventoryOperationParams) =>
  apiFetch("/api/v1/store/packet/operation/", {
    method: "POST",
    body: JSON.stringify({
      packet: params.packet,
      operation_type: "inventory",
      absolute_quantity: params.absoluteQuantity,
      description: params.fast
        ? `Fast inventory | Physical count: ${params.absoluteQuantity}`
        : buildInventoryDescriptionPrefix(
            params.absoluteQuantity,
            params.userDescription ?? null,
          ),
      reference: params.reference ?? null,
    }),
  })

export const groupInventoryOpsByPacket = (
  ops: Array<{ packet: string }>,
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const op of ops) {
    map.set(op.packet, (map.get(op.packet) ?? 0) + 1)
  }
  return map
}

export const toApiPath = (url: string): string => {
  if (url.startsWith("/")) {
    return url
  }
  try {
    const parsed = new URL(url)
    return parsed.pathname + parsed.search
  } catch {
    return url
  }
}

export async function fetchAllPaginated<T>(initialPath: string): Promise<T[]> {
  const all: T[] = []
  let path: string | null = initialPath

  while (path) {
    const response: T[] | PaginatedResponse<T> = await apiFetch<T[] | PaginatedResponse<T>>(
      path,
    )
    if (Array.isArray(response)) {
      return response
    }
    all.push(...(response.results ?? []))
    path = response.next ? toApiPath(response.next) : null
  }
  return all
}

export const getInventoryStatusLabel = (operationCount: number | undefined): string => {
  if (!operationCount) {
    return "Not inventoried"
  }
  if (operationCount === 1) {
    return "Inventoried"
  }
  return `Inventoried (${operationCount}×)`
}
