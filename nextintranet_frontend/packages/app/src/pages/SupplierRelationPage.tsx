import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Check, Copy, RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

interface Supplier {
  id: string
  name: string
  website?: string | null
  api_plugin_instance?: string | null
}

interface SupplierRelation {
  id: string
  component?: string | null
  supplier?: Supplier | null
  symbol?: string | null
  description?: string | null
  custom_url?: string | null
  url?: string | null
  api_data?: {
    payload?: JsonValue
    raw?: JsonValue
    fetched_at?: string
    source?: {
      definition_key?: string
      symbol?: string
    }
  } | null
  api_fetched_at?: string | null
  api_applied_at?: string | null
  api_price?: string | null
  api_availability?: string | null
}

interface Component {
  id: string
  name: string
}

const isPlainObject = (value: JsonValue): value is Record<string, JsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const formatPrimitive = (value: JsonValue) => {
  if (value === null) {
    return "null"
  }
  if (typeof value === "string") {
    return value
  }
  return String(value)
}

function JsonNode({ name, value, level }: { name: string; value: JsonValue; level: number }) {
  if (Array.isArray(value)) {
    return (
      <details open={level < 1} className="rounded-md border border-border/40 bg-muted/20">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
          {name} [{value.length}]
        </summary>
        <div className="space-y-2 px-3 pb-3">
          {value.map((entry, index) => (
            <JsonNode key={`${name}-${index}`} name={`${index}`} value={entry} level={level + 1} />
          ))}
        </div>
      </details>
    )
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    return (
      <details open={level < 1} className="rounded-md border border-border/40 bg-muted/20">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
          {name} {"{"}
          {entries.length}
          {"}"}
        </summary>
        <div className="space-y-2 px-3 pb-3">
          {entries.map(([key, entry]) => (
            <JsonNode key={`${name}-${key}`} name={key} value={entry} level={level + 1} />
          ))}
        </div>
      </details>
    )
  }

  return (
    <div className="flex flex-wrap items-baseline gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{name}:</span>
      <span className="font-mono text-xs text-foreground">{formatPrimitive(value)}</span>
    </div>
  )
}

export function SupplierRelationPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.find(
      (permission) => permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
    )

  const { data: relation, isLoading } = useQuery<SupplierRelation>({
    queryKey: ["supplier-relation", id],
    queryFn: () => apiFetch<SupplierRelation>(`/api/v1/store/supplier/relation/${id}/`),
    enabled: !!id,
  })

  const { data: component } = useQuery<Component>({
    queryKey: ["supplier-relation-component", relation?.component],
    queryFn: () =>
      apiFetch<Component>(`/api/v1/store/component/${relation?.component}/`),
    enabled: !!relation?.component,
  })

  const apiPayload = useMemo(
    () => relation?.api_data?.payload ?? relation?.api_data?.raw ?? null,
    [relation?.api_data],
  )

  const syncMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/store/supplier/relation/${id}/sync/`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-relation", id] })
      toast.success("Supplier data synced.")
    },
    onError: () => {
      toast.error("Failed to sync supplier data.")
    },
  })

  const applyMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/store/supplier/relation/${id}/apply/`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-relation", id] })
      if (relation?.component) {
        queryClient.invalidateQueries({ queryKey: ["component", relation.component] })
        queryClient.invalidateQueries({ queryKey: ["component-parameters", relation.component] })
      }
      toast.success("Supplier data applied.")
    },
    onError: () => {
      toast.error("Failed to apply supplier data.")
    },
  })

  const handleCopyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Link copied.")
    } catch {
      toast.error("Unable to copy link.")
    }
  }

  const hasPlugin = Boolean(relation?.supplier?.api_plugin_instance)
  const hasSymbol = Boolean(relation?.symbol)
  const canSync = Boolean(hasPlugin && hasSymbol)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Supplier relation</h1>
          <p className="text-sm text-muted-foreground">
            Review supplier API data and apply mapping to the component.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={!canEdit || !canSync || syncMutation.isPending}
          >
            <RefreshCcw className="h-4 w-4" />
            Sync data
          </Button>
          <Button
            onClick={() => applyMutation.mutate()}
            disabled={!canEdit || !canSync || applyMutation.isPending}
          >
            <Check className="h-4 w-4" />
            Apply mapping
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Relation details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Supplier</p>
                {relation?.supplier ? (
                  <Link
                    to={`/store/supplier/${relation.supplier.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {relation.supplier.name}
                  </Link>
                ) : (
                  <p>-</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Component</p>
                {component ? (
                  <Link
                    to={`/store/component/${component.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {component.name}
                  </Link>
                ) : (
                  <p>{relation?.component || "-"}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Symbol</p>
                <p className="text-sm text-foreground">{relation?.symbol || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Product link</p>
                {relation?.url ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={relation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {relation.url}
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyLink(relation.url as string)}
                      aria-label="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p>-</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Last sync</p>
                <p className="text-sm text-foreground">
                  {relation?.api_fetched_at
                    ? new Date(relation.api_fetched_at).toLocaleString()
                    : "-"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Last apply</p>
                <p className="text-sm text-foreground">
                  {relation?.api_applied_at
                    ? new Date(relation.api_applied_at).toLocaleString()
                    : "-"}
                </p>
              </div>
              {relation?.api_price != null && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">API price</p>
                  <p className="text-sm text-foreground">{relation.api_price}</p>
                </div>
              )}
              {relation?.api_availability != null && relation.api_availability !== "" && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">API availability</p>
                  <p className="text-sm text-foreground">{relation.api_availability}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {apiPayload ? (
                <JsonNode name="payload" value={apiPayload} level={0} />
              ) : (
                <p className="text-sm text-muted-foreground">No API data stored yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
