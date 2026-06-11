import { useRef } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Cpu, ImageIcon, KeyRound, Laptop, LayoutTemplate, Tags } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  setQuickActionsFabVisible,
  useQuickActionsFabVisible,
} from "@/lib/quickActionsFabVisibility"
import { resolveFileUrl } from "@/lib/printing"

interface BrandingSettings {
  logo_url?: string | null
  updated_at?: string | null
}

interface UserMe {
  is_staff?: boolean
  is_superuser?: boolean
}

export function SettingsPage() {
  const quickActionsFabVisible = useQuickActionsFabVisible()
  const queryClient = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement | null>(null)

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })
  const canManageBranding = Boolean(me?.is_staff || me?.is_superuser)

  const { data: branding } = useQuery({
    queryKey: ["branding-settings"],
    queryFn: () => apiFetch<BrandingSettings>("/api/v1/setting/branding/"),
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => {
      const data = new FormData()
      data.append("logo", file)
      return apiFetch("/api/v1/setting/branding/", {
        method: "POST",
        body: data,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branding-settings"] })
      toast.success("Logo uploaded.")
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to upload logo: ${message}`)
    },
  })

  const deleteLogoMutation = useMutation({
    mutationFn: () => apiFetch("/api/v1/setting/branding/", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branding-settings"] })
      toast.success("Logo removed.")
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to remove logo: ${message}`)
    },
  })

  const handleLogoFile = (file: File | null) => {
    if (!file) {
      return
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Unsupported logo format. Upload a PNG or JPEG image.")
      return
    }
    uploadLogoMutation.mutate(file)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Choose a section to configure your local workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Interface</CardTitle>
            <CardDescription>
              Control optional on-screen shortcuts in the web app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-row items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="quick-actions-fab">Show quick actions button</Label>
              <p className="text-xs text-muted-foreground">
                Floating menu with camera barcode scan and more.
              </p>
            </div>
            <Switch
              id="quick-actions-fab"
              checked={quickActionsFabVisible}
              onCheckedChange={setQuickActionsFabVisible}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Cpu className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Hardware</CardTitle>
            <CardDescription>
              Configure scanners, local agents, and station printer preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/setting/hardware">Open hardware settings</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Service tokens</CardTitle>
            <CardDescription>
              Generate and manage personal integration tokens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/settings/service-token">Open service tokens</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Laptop className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Software</CardTitle>
            <CardDescription>
              Download integration config files for desktop tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/settings/software">Open software settings</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Tags className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Label templates</CardTitle>
            <CardDescription>
              Manage label layouts and their supported print formats.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/settings/label-template">Open label templates</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>Branding</CardTitle>
            <CardDescription>
              Organization logo printed on labels (PNG or JPEG).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {branding?.logo_url ? (
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1.5">
                  <img
                    src={resolveFileUrl(branding.logo_url)}
                    alt="Organization logo"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <span className="text-xs text-muted-foreground">Current logo</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No logo uploaded yet.</p>
            )}
            {canManageBranding ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(event) => {
                    handleLogoFile(event.target.files?.[0] ?? null)
                    event.target.value = ""
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadLogoMutation.isPending}
                >
                  {uploadLogoMutation.isPending ? "Uploading..." : "Upload logo"}
                </Button>
                {branding?.logo_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteLogoMutation.mutate()}
                    disabled={deleteLogoMutation.isPending}
                  >
                    Remove logo
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only administrators can change the logo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
