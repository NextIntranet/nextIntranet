import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, getApiConfig } from "@nextintranet/core"
import { toast } from "sonner"
import { Check, Copy } from "lucide-react"

import { DocHelpButton } from "@/components/DocHelpButton"
import { DocLink } from "@/components/DocLink"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const DEFAULT_MCP_SERVER_NAME = "nextintranet-warehouse"

interface UserMe {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

const hasWarehouseWrite = (user: UserMe | undefined) =>
  Boolean(
    user?.is_superuser ||
      user?.access_permissions?.some(
        (permission) =>
          permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
      ),
  )

const buildKicadFilename = (tokenName: string) => {
  const normalized = tokenName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/-+/g, "-")
  const safeName = normalized || "token"
  return `nextintranet-${safeName}.kicad_httplib`
}

export function SoftwareSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })
  const canMcpWrite = useMemo(() => hasWarehouseWrite(me), [me])
  const [kicadTokenName, setKicadTokenName] = useState("")
  const [mcpTokenName, setMcpTokenName] = useState("")
  const [mcpServerName, setMcpServerName] = useState(DEFAULT_MCP_SERVER_NAME)
  const [mcpScope, setMcpScope] = useState<"read" | "write">("read")
  const [mcpConfigJson, setMcpConfigJson] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!canMcpWrite && mcpScope === "write") {
      setMcpScope("read")
    }
  }, [canMcpWrite, mcpScope])

  const generateKicadConfigMutation = useMutation({
    mutationFn: async (name: string) => {
      const cfg = getApiConfig()
      const accessToken = cfg.getToken()
      const response = await fetch(`${cfg.baseUrl}/api/v1/service-token/generate-kicad-config/`, {
        method: "POST",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      })

      if (response.status === 401) {
        cfg.onUnauthorized()
        throw new Error("Unauthorized")
      }
      if (!response.ok) {
        throw new Error(`Failed to generate config (${response.status})`)
      }
      const blob = await response.blob()
      downloadBlob(blob, buildKicadFilename(name))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-tokens"] })
      setKicadTokenName("")
      toast.success("KiCad config generated and downloaded.")
    },
    onError: () => {
      toast.error("Failed to generate KiCad config.")
    },
  })

  const generateMcpConfigMutation = useMutation({
    mutationFn: async ({
      name,
      serverName,
      scope,
    }: {
      name: string
      serverName: string
      scope: string
    }) => {
      const cfg = getApiConfig()
      const accessToken = cfg.getToken()
      const response = await fetch(`${cfg.baseUrl}/api/v1/service-token/generate-mcp-config/`, {
        method: "POST",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          server_name: serverName.trim() || DEFAULT_MCP_SERVER_NAME,
          scope,
        }),
      })

      if (response.status === 401) {
        cfg.onUnauthorized()
        throw new Error("Unauthorized")
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string; error?: string } | null
        throw new Error(
          payload?.detail || payload?.error || `Failed to generate MCP config (${response.status})`,
        )
      }
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["service-tokens"] })
      setMcpTokenName("")
      setMcpServerName(DEFAULT_MCP_SERVER_NAME)
      setMcpConfigJson(JSON.stringify(data.config, null, 2))
      setCopied(false)
      toast.success("MCP config generated. Copy the JSON below.")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to generate MCP config.")
    },
  })

  const handleCopyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfigJson)
      setCopied(true)
      toast.success("MCP config copied to clipboard.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy to clipboard.")
    }
  }

  return (
    <div className={embedded ? "w-full space-y-6" : "mx-auto w-full max-w-3xl space-y-6"}>
      {!embedded && (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Software</h1>
          <p className="text-sm text-muted-foreground">
            Generate configuration files for software integrations.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Generate KiCad config</CardTitle>
          <CardDescription>
            Creates a new KiCad token and immediately downloads a configured{" "}
            <code className="text-foreground">.kicad_httplib</code> file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="kicad-token-name">Token name</Label>
            <Input
              id="kicad-token-name"
              placeholder="KiCad workstation token"
              value={kicadTokenName}
              onChange={(event) => setKicadTokenName(event.target.value)}
            />
          </div>
          <Button
            onClick={() => generateKicadConfigMutation.mutate(kicadTokenName.trim())}
            disabled={generateKicadConfigMutation.isPending}
          >
            {generateKicadConfigMutation.isPending ? "Generating..." : "Generate config"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Generate MCP config</CardTitle>
            <DocHelpButton
              page="guide/settings/mcp"
              hash="generate-token"
              label="MCP setup help"
            />
          </div>
          <CardDescription>
            Creates a new service token and generates a JSON configuration
            for MCP clients (Claude Code, Claude Desktop, Cursor, etc.).
            Copy the JSON into your client&apos;s MCP settings.{" "}
            <DocLink page="guide/settings/mcp" hash="claude-code-setup" className="text-primary underline">
              Read the MCP setup guide
            </DocLink>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mcp-token-name">Token name</Label>
              <Input
                id="mcp-token-name"
                placeholder="MCP warehouse token"
                value={mcpTokenName}
                onChange={(event) => setMcpTokenName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Label for this token inside NextIntranet (shown in service token lists).
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mcp-server-name">MCP server name</Label>
              <Input
                id="mcp-server-name"
                placeholder={DEFAULT_MCP_SERVER_NAME}
                value={mcpServerName}
                onChange={(event) => setMcpServerName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Key under <code className="text-foreground">mcpServers</code> in the generated JSON.
                Use a unique name if you connect multiple NextIntranet instances.
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Access level</Label>
            <div className="flex gap-2">
              <Button
                variant={mcpScope === "read" ? "default" : "outline"}
                size="sm"
                onClick={() => setMcpScope("read")}
              >
                Read-only
              </Button>
              {canMcpWrite ? (
                <Button
                  variant={mcpScope === "write" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMcpScope("write")}
                >
                  Read &amp; Write
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {mcpScope === "write"
                ? "All read tools plus create/update/delete for components, categories, locations, suppliers, reservations, and parameter types."
                : "Search components, view inventory, categories, locations, suppliers, reservations, and parameter types."}
              {!canMcpWrite ? " Read-write tokens require warehouse write access in NextIntranet." : null}
            </p>
          </div>
          <Button
            onClick={() =>
              generateMcpConfigMutation.mutate({
                name: mcpTokenName.trim(),
                serverName: mcpServerName,
                scope: mcpScope,
              })
            }
            disabled={generateMcpConfigMutation.isPending}
          >
            {generateMcpConfigMutation.isPending ? "Generating..." : "Generate config"}
          </Button>

          {mcpConfigJson && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>MCP configuration JSON</Label>
                <Button variant="outline" size="sm" onClick={handleCopyMcpConfig}>
                  {copied ? (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <pre className="rounded-md border bg-muted p-4 text-sm overflow-x-auto">
                <code>{mcpConfigJson}</code>
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
