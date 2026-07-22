import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface ServiceTokenItem {
  id: string
  name: string
  token_prefix: string
  scopes: string[]
  scope_labels: string[]
  is_active: boolean
  expires_at?: string | null
  last_used_at?: string | null
  created_at: string
}

interface ServiceTokenCreateResponse extends ServiceTokenItem {
  raw_token: string
}

interface ScopeOption {
  value: string
  label: string
}

const defaultScopeOptions: ScopeOption[] = [
  { value: "api:read", label: "API read-only" },
  { value: "api:all", label: "API all" },
  { value: "kicad:read", label: "KiCad read-only" },
  { value: "print:render", label: "Print render" },
]

const formatDate = (value?: string | null) => {
  if (!value) {
    return "Never"
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function ServiceTokensPage() {
  const queryClient = useQueryClient()
  const [tokenName, setTokenName] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["api:read"])
  const [oneTimeToken, setOneTimeToken] = useState("")

  const { data: tokens, isLoading } = useQuery<ServiceTokenItem[]>({
    queryKey: ["service-tokens"],
    queryFn: () => apiFetch<ServiceTokenItem[]>("/api/v1/service-token/"),
  })

  const { data: scopeOptionsData } = useQuery<ScopeOption[]>({
    queryKey: ["service-token-scopes"],
    queryFn: () => apiFetch<ScopeOption[]>("/api/v1/service-token/scope-options/"),
  })

  const scopeOptions = useMemo(
    () => (scopeOptionsData && scopeOptionsData.length > 0 ? scopeOptionsData : defaultScopeOptions),
    [scopeOptionsData],
  )

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; scopes: string[] }) =>
      apiFetch<ServiceTokenCreateResponse>("/api/v1/service-token/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["service-tokens"] })
      setOneTimeToken(response.raw_token || "")
      setTokenName("")
      setSelectedScopes(["api:read"])
      toast.success("Token created. Copy it now; it will not be shown again.")
    },
    onError: () => {
      toast.error("Failed to create token.")
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/service-token/${id}/deactivate/`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-tokens"] })
      toast.success("Token deactivated.")
    },
    onError: () => {
      toast.error("Failed to deactivate token.")
    },
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/service-token/${id}/activate/`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-tokens"] })
      toast.success("Token activated.")
    },
    onError: () => {
      toast.error("Failed to activate token.")
    },
  })

  const toggleScope = (scope: string, checked: boolean) => {
    setSelectedScopes((previous) => {
      const nextSet = new Set(previous)
      if (checked) {
        nextSet.add(scope)
      } else {
        nextSet.delete(scope)
      }

      if (scope === "api:all" && checked) {
        nextSet.delete("api:read")
      }
      if (scope === "api:read" && checked) {
        nextSet.delete("api:all")
      }

      return Array.from(nextSet)
    })
  }

  const handleCreate = () => {
    const normalizedName = tokenName.trim()
    if (!normalizedName) {
      toast.error("Token name is required.")
      return
    }
    if (selectedScopes.length === 0) {
      toast.error("Select at least one scope.")
      return
    }
    createMutation.mutate({
      name: normalizedName,
      scopes: selectedScopes,
    })
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Service tokens</h1>
        <p className="text-sm text-muted-foreground">
          Create personal integration tokens and deactivate them when no longer needed.
        </p>
      </div>

      {oneTimeToken ? (
        <Card className="border-amber-300/70 bg-amber-50/40">
          <CardHeader>
            <CardTitle>Copy token now</CardTitle>
            <CardDescription>
              This token is shown only once. Store it securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
              {oneTimeToken}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(oneTimeToken)
                    toast.success("Token copied.")
                  } catch {
                    toast.error("Unable to copy token.")
                  }
                }}
              >
                Copy token
              </Button>
              <Button variant="ghost" onClick={() => setOneTimeToken("")}>
                Hide
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Create token</CardTitle>
            <CardDescription>
              Scopes define what the token can access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="token-name">Token name</Label>
              <Input
                id="token-name"
                placeholder="Build server token"
                value={tokenName}
                onChange={(event) => setTokenName(event.target.value)}
              />
            </div>
            <div className="space-y-3">
              <Label>Scopes</Label>
              <div className="grid gap-2">
                {scopeOptions.map((option) => (
                  <label
                    key={option.value}
                    htmlFor={`scope-${option.value}`}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      id={`scope-${option.value}`}
                      checked={selectedScopes.includes(option.value)}
                      onCheckedChange={(checked) => toggleScope(option.value, checked === true)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create token"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your tokens</CardTitle>
          <CardDescription>
            Token values are never displayed again after creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="w-full table-fixed">
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/50">
                <TableHead className="h-9 w-[22%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-9 w-[15%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Prefix
                </TableHead>
                <TableHead className="h-9 w-[23%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Scopes
                </TableHead>
                <TableHead className="h-9 w-[16%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Last used
                </TableHead>
                <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-9 w-[14%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="border-border/40">
                  <TableCell colSpan={6} className="py-6">
                    <div className="space-y-2 px-3">
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-5 w-1/2" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : tokens && tokens.length > 0 ? (
                tokens.map((token) => (
                  <TableRow key={token.id} className="border-border/40">
                    <TableCell className="h-9 px-3">
                      <div className="truncate text-sm font-medium">{token.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDate(token.created_at)}
                      </div>
                    </TableCell>
                    <TableCell className="h-9 px-3 font-mono text-xs text-muted-foreground">
                      {token.token_prefix}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {(token.scope_labels || []).join(", ")}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {formatDate(token.last_used_at)}
                    </TableCell>
                    <TableCell className="h-9 px-3">
                      <span
                        className={
                          token.is_active
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {token.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="h-9 px-3">
                      {token.is_active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deactivateMutation.mutate(token.id)}
                          disabled={deactivateMutation.isPending}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => activateMutation.mutate(token.id)}
                          disabled={activateMutation.isPending}
                        >
                          Activate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-border/40">
                  <TableCell colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No tokens yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
