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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
const MCP_CONFIG_STORAGE_KEY = "nextintranet.software-settings.mcp-config"
const SERVER_NAME_PLACEHOLDER = "<SERVER_NAME>"
const SERVICE_TOKEN_PLACEHOLDER = "<SERVICE_TOKEN>"

type McpClient = "opencode" | "codex" | "generic"

interface StoredMcpConfig {
  serverName: string
  url: string
  token: string
}

interface McpConfigResponse {
  config?: {
    mcpServers?: Record<string, { url?: string; headers?: Record<string, string> }>
  }
}

function loadStoredMcpConfig(): StoredMcpConfig | null {
  try {
    const raw = localStorage.getItem(MCP_CONFIG_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredMcpConfig> | null
    if (
      typeof parsed?.serverName === "string" &&
      typeof parsed?.url === "string" &&
      typeof parsed?.token === "string"
    ) {
      return parsed as StoredMcpConfig
    }
  } catch {
    // Ignore malformed stored configs.
  }
  return null
}

function storeMcpConfig(config: StoredMcpConfig) {
  try {
    localStorage.setItem(MCP_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Local storage unavailable; the config only lives for this session.
  }
}

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
  const [storedMcpConfig, setStoredMcpConfig] = useState<StoredMcpConfig | null>(() => loadStoredMcpConfig())
  const [mcpServerName, setMcpServerName] = useState(
    () => storedMcpConfig?.serverName ?? DEFAULT_MCP_SERVER_NAME,
  )
  const [mcpScope, setMcpScope] = useState<"read" | "write">("read")
  const [mcpClient, setMcpClient] = useState<McpClient>("opencode")
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
      return response.json() as Promise<McpConfigResponse>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["service-tokens"] })
      setMcpTokenName("")
      const servers = data.config?.mcpServers ?? {}
      const [serverName, entry] = Object.entries(servers)[0] ?? []
      const token = entry?.headers?.["X-Service-Token"]
      if (!serverName || !entry?.url || !token) {
        toast.error("MCP token generated, but the server returned an unexpected response.")
        return
      }
      const nextConfig: StoredMcpConfig = { serverName, url: entry.url, token }
      setStoredMcpConfig(nextConfig)
      setMcpServerName(serverName)
      storeMcpConfig(nextConfig)
      setCopied(false)
      toast.success("MCP token generated. The configuration below is ready to copy.")
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to generate MCP config.")
    },
  })

  const mcpConfigValues = useMemo(() => {
    const serverName = storedMcpConfig
      ? mcpServerName.trim() || storedMcpConfig.serverName
      : SERVER_NAME_PLACEHOLDER
    const url = storedMcpConfig?.url ?? `${window.location.origin}/mcp`
    const token = storedMcpConfig?.token ?? SERVICE_TOKEN_PLACEHOLDER
    return { serverName, url, token }
  }, [storedMcpConfig, mcpServerName])

  const mcpClientConfigs = useMemo(
    () => ({
      opencode: JSON.stringify(
        {
          $schema: "https://opencode.ai/config.json",
          mcp: {
            [mcpConfigValues.serverName]: {
              type: "remote",
              url: mcpConfigValues.url,
              headers: { "X-Service-Token": mcpConfigValues.token },
            },
          },
        },
        null,
        2,
      ),
      codex: [
        `[mcp_servers.${mcpConfigValues.serverName}]`,
        `url = ${JSON.stringify(mcpConfigValues.url)}`,
        `http_headers = { "X-Service-Token" = ${JSON.stringify(mcpConfigValues.token)} }`,
        "",
      ].join("\n"),
      generic: JSON.stringify(
        {
          mcpServers: {
            [mcpConfigValues.serverName]: {
              type: "http",
              url: mcpConfigValues.url,
              headers: { "X-Service-Token": mcpConfigValues.token },
            },
          },
        },
        null,
        2,
      ),
    }),
    [mcpConfigValues],
  )

  const handleCopyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpClientConfigs[mcpClient])
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
            Creates a new service token and shows ready-to-use MCP client
            configurations (OpenCode, Codex, Claude Code, Cursor, etc.). The
            configuration stays visible on this page and is kept in this
            browser.{" "}
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
                Server name used as the key in the client configurations below.
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

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>MCP client configuration</Label>
              <p className="text-xs text-muted-foreground">
                {storedMcpConfig
                  ? "Values are filled with your generated token."
                  : "Placeholders are shown until you generate a token."}
              </p>
            </div>
            <Tabs value={mcpClient} onValueChange={(value) => setMcpClient(value as McpClient)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="opencode">OpenCode</TabsTrigger>
                  <TabsTrigger value="codex">Codex</TabsTrigger>
                  <TabsTrigger value="generic">Other clients</TabsTrigger>
                </TabsList>
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
              <TabsContent value="opencode" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Merge into <code className="text-foreground">opencode.json</code> in your project root or{" "}
                  <code className="text-foreground">~/.config/opencode/opencode.json</code>.
                </p>
                <pre className="rounded-md border bg-muted p-4 text-sm overflow-x-auto">
                  <code>{mcpClientConfigs.opencode}</code>
                </pre>
              </TabsContent>
              <TabsContent value="codex" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Add to <code className="text-foreground">~/.codex/config.toml</code> (or{" "}
                  <code className="text-foreground">.codex/config.toml</code> in a trusted project).
                </p>
                <pre className="rounded-md border bg-muted p-4 text-sm overflow-x-auto">
                  <code>{mcpClientConfigs.codex}</code>
                </pre>
              </TabsContent>
              <TabsContent value="generic" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Claude Code, Claude Desktop, Cursor and other clients that use the{" "}
                  <code className="text-foreground">mcpServers</code> JSON format.
                </p>
                <pre className="rounded-md border bg-muted p-4 text-sm overflow-x-auto">
                  <code>{mcpClientConfigs.generic}</code>
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
