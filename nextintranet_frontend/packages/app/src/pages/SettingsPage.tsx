import { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, getRealtimeClient, type RealtimeEvent } from "@nextintranet/core"
import {
  ChevronDown,
  Cpu,
  Download,
  ImageIcon,
  KeyRound,
  Laptop,
  LayoutTemplate,
  type LucideIcon,
  RefreshCw,
  Tags,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  setQuickActionsFabVisible,
  useQuickActionsFabVisible,
} from "@/lib/quickActionsFabVisibility"
import { resolveFileUrl } from "@/lib/printing"
import { usePwaInstall } from "@/lib/branding"
import { cn } from "@/lib/utils"

interface BrandingSettings {
  company_name: string
  company_short_name: string
  theme_color: string
  background_color: string
  logo_url?: string | null
  pwa_icon_192_url?: string | null
  pwa_icon_512_url?: string | null
  pwa_icon_maskable_url?: string | null
  updated_at?: string | null
}

interface UserMe {
  is_staff?: boolean
  is_superuser?: boolean
}

interface PacketRecalcJob {
  id: string
  status: "queued" | "processing" | "done" | "failed"
  total: number
  processed: number
  error?: string
}

interface PacketRecalcProgressEvent {
  job_id: string
  processed: number
  total: number
  status: PacketRecalcJob["status"]
  error?: string
}

function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  open,
  onToggle,
  registerRef,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  description: string
  open: boolean
  onToggle: () => void
  registerRef: (el: HTMLDivElement | null) => void
  children: React.ReactNode
}) {
  return (
    <div ref={registerRef} id={id} className="scroll-mt-4">
      <Card className="overflow-hidden">
        <Collapsible open={open} onOpenChange={onToggle}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-4 p-4 text-left hover:bg-muted/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="font-medium text-foreground">{title}</div>
                <div className="text-sm text-muted-foreground">{description}</div>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="border-t border-border pt-4 pb-4">{children}</CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  )
}

export function SettingsPage() {
  const quickActionsFabVisible = useQuickActionsFabVisible()
  const queryClient = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const location = useLocation()

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const hash = window.location.hash.replace("#", "")
    return hash ? new Set([hash]) : new Set()
  })
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const hash = location.hash.replace("#", "")
    if (!hash) return
    setOpenSections((prev) => (prev.has(hash) ? prev : new Set(prev).add(hash)))
    const el = sectionRefs.current[hash]
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [location.hash])

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })
  const canManageBranding = Boolean(me?.is_staff || me?.is_superuser)

  const { data: branding } = useQuery({
    queryKey: ["branding-settings"],
    queryFn: () => apiFetch<BrandingSettings>("/api/v1/setting/branding/"),
  })

  const [brandingForm, setBrandingForm] = useState({
    company_name: "",
    company_short_name: "",
    theme_color: "#0f172a",
    background_color: "#ffffff",
  })

  useEffect(() => {
    if (!branding) return
    setBrandingForm({
      company_name: branding.company_name || "",
      company_short_name: branding.company_short_name || "",
      theme_color: branding.theme_color || "#0f172a",
      background_color: branding.background_color || "#ffffff",
    })
  }, [branding])

  const [recalcJob, setRecalcJob] = useState<PacketRecalcJob | null>(null)

  useEffect(() => {
    if (!recalcJob || recalcJob.status === "done" || recalcJob.status === "failed") return
    const unsubscribe = getRealtimeClient().onMessage((event: RealtimeEvent) => {
      if (event.type !== "packet_recalc_progress") return
      const payload = event.payload as PacketRecalcProgressEvent | undefined
      if (!payload || payload.job_id !== recalcJob.id) return
      setRecalcJob((prev) => (prev ? { ...prev, ...payload } : prev))
      if (payload.status === "done") {
        toast.success(`Recalculated ${payload.total} packets.`)
      } else if (payload.status === "failed") {
        toast.error(`Packet recalculation failed: ${payload.error || "unknown error"}`)
      }
    })
    return unsubscribe
  }, [recalcJob?.id, recalcJob?.status])

  const recalculatePacketsMutation = useMutation({
    mutationFn: () =>
      apiFetch<PacketRecalcJob>("/api/warehouse/packet/recalculate-all/", { method: "POST" }),
    onSuccess: (job) => {
      setRecalcJob(job)
      toast.info("Packet recalculation started.")
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to start recalculation: ${message}`)
    },
  })

  const recalcRunning = recalcJob?.status === "queued" || recalcJob?.status === "processing"
  const recalcPercent = recalcJob && recalcJob.total > 0
    ? Math.round((recalcJob.processed / recalcJob.total) * 100)
    : 0

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => {
      const data = new FormData()
      data.append("logo", file)
      return apiFetch<BrandingSettings>("/api/v1/setting/branding/", {
        method: "POST",
        body: data,
      })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["branding-settings"] })
      window.dispatchEvent(new CustomEvent("branding-updated", { detail: data }))
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

  const saveBrandingMutation = useMutation({
    mutationFn: (data: typeof brandingForm) =>
      apiFetch<BrandingSettings>("/api/v1/setting/branding/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["branding-settings"] })
      window.dispatchEvent(new CustomEvent("branding-updated", { detail: data }))
      toast.success("Branding settings saved.")
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to save branding: ${message}`)
    },
  })

  const hasBrandingChanges = branding
    ? brandingForm.company_name !== (branding.company_name || "") ||
      brandingForm.company_short_name !== (branding.company_short_name || "") ||
      brandingForm.theme_color !== (branding.theme_color || "#0f172a") ||
      brandingForm.background_color !== (branding.background_color || "#ffffff")
    : false

  const { isInstallable, isInstalled, isIos, prompt: installApp } = usePwaInstall()

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
          Click a section below to expand it and configure your local workspace.
        </p>
      </div>

      <div className="space-y-3">
        <SettingsSection
          id="interface"
          icon={LayoutTemplate}
          title="Interface"
          description="Control optional on-screen shortcuts in the web app."
          open={openSections.has("interface")}
          onToggle={() => toggleSection("interface")}
          registerRef={(el) => (sectionRefs.current["interface"] = el)}
        >
          <div className="flex flex-row items-center justify-between gap-4">
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
          </div>
        </SettingsSection>

        <SettingsSection
          id="hardware"
          icon={Cpu}
          title="Hardware"
          description="Configure scanners, local agents, and station printer preferences."
          open={openSections.has("hardware")}
          onToggle={() => toggleSection("hardware")}
          registerRef={(el) => (sectionRefs.current["hardware"] = el)}
        >
          <Button asChild>
            <Link to="/setting/hardware">Open hardware settings</Link>
          </Button>
        </SettingsSection>

        <SettingsSection
          id="packet-recalc"
          icon={RefreshCw}
          title="Packet recalculation"
          description="Recompute cached count and price fields for every packet in the warehouse."
          open={openSections.has("packet-recalc")}
          onToggle={() => toggleSection("packet-recalc")}
          registerRef={(el) => (sectionRefs.current["packet-recalc"] = el)}
        >
          <div className="space-y-3">
            <Button
              onClick={() => recalculatePacketsMutation.mutate()}
              disabled={recalcRunning || recalculatePacketsMutation.isPending}
            >
              {recalcRunning ? "Recalculating…" : "Recalculate all packets"}
            </Button>
            {recalcJob ? (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${recalcJob.status === "done" ? 100 : recalcPercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {recalcJob.status === "failed"
                    ? `Failed: ${recalcJob.error || "unknown error"}`
                    : `${recalcJob.processed} / ${recalcJob.total} packets (${recalcJob.status})`}
                </p>
              </div>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection
          id="service-tokens"
          icon={KeyRound}
          title="Service tokens"
          description="Generate and manage personal integration tokens."
          open={openSections.has("service-tokens")}
          onToggle={() => toggleSection("service-tokens")}
          registerRef={(el) => (sectionRefs.current["service-tokens"] = el)}
        >
          <Button asChild>
            <Link to="/settings/service-token">Open service tokens</Link>
          </Button>
        </SettingsSection>

        <SettingsSection
          id="software"
          icon={Laptop}
          title="Software"
          description="Download integration config files for desktop tools."
          open={openSections.has("software")}
          onToggle={() => toggleSection("software")}
          registerRef={(el) => (sectionRefs.current["software"] = el)}
        >
          <Button asChild>
            <Link to="/settings/software">Open software settings</Link>
          </Button>
        </SettingsSection>

        <SettingsSection
          id="label-templates"
          icon={Tags}
          title="Label templates"
          description="Manage label layouts and their supported print formats."
          open={openSections.has("label-templates")}
          onToggle={() => toggleSection("label-templates")}
          registerRef={(el) => (sectionRefs.current["label-templates"] = el)}
        >
          <Button asChild>
            <Link to="/settings/label-template">Open label templates</Link>
          </Button>
        </SettingsSection>

        <SettingsSection
          id="branding"
          icon={ImageIcon}
          title="Branding"
          description="Organization identity used on labels, the page title, and the PWA install prompt."
          open={openSections.has("branding")}
          onToggle={() => toggleSection("branding")}
          registerRef={(el) => (sectionRefs.current["branding"] = el)}
        >
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  value={brandingForm.company_name}
                  onChange={(e) =>
                    setBrandingForm((prev) => ({ ...prev, company_name: e.target.value }))
                  }
                  placeholder="NextIntranet"
                  disabled={!canManageBranding}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-short-name">Short name</Label>
                <Input
                  id="company-short-name"
                  value={brandingForm.company_short_name}
                  onChange={(e) =>
                    setBrandingForm((prev) => ({ ...prev, company_short_name: e.target.value }))
                  }
                  placeholder="NextIntranet"
                  disabled={!canManageBranding}
                />
                <p className="text-xs text-muted-foreground">Shown under the app icon.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme-color">Theme color</Label>
                <div className="flex gap-2">
                  <Input
                    id="theme-color"
                    type="color"
                    value={brandingForm.theme_color}
                    onChange={(e) =>
                      setBrandingForm((prev) => ({ ...prev, theme_color: e.target.value }))
                    }
                    className="h-10 w-12 px-1 py-1"
                    disabled={!canManageBranding}
                  />
                  <Input
                    value={brandingForm.theme_color}
                    onChange={(e) =>
                      setBrandingForm((prev) => ({ ...prev, theme_color: e.target.value }))
                    }
                    disabled={!canManageBranding}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="background-color">Background color</Label>
                <div className="flex gap-2">
                  <Input
                    id="background-color"
                    type="color"
                    value={brandingForm.background_color}
                    onChange={(e) =>
                      setBrandingForm((prev) => ({ ...prev, background_color: e.target.value }))
                    }
                    className="h-10 w-12 px-1 py-1"
                    disabled={!canManageBranding}
                  />
                  <Input
                    value={brandingForm.background_color}
                    onChange={(e) =>
                      setBrandingForm((prev) => ({ ...prev, background_color: e.target.value }))
                    }
                    disabled={!canManageBranding}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="space-y-2">
                <Label>Logo</Label>
                {branding?.logo_url ? (
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1.5"
                      style={{ backgroundColor: brandingForm.background_color }}
                    >
                      <img
                        src={resolveFileUrl(branding.logo_url)}
                        alt="Organization logo"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No logo uploaded yet.</p>
                )}
                {canManageBranding && (
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
                )}
              </div>

              <div className="space-y-2">
                <Label>PWA preview</Label>
                <div
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                  style={{ backgroundColor: brandingForm.background_color }}
                >
                  <div
                    className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl shadow-sm"
                    style={{ backgroundColor: brandingForm.theme_color }}
                  >
                    {branding?.pwa_icon_192_url || branding?.logo_url ? (
                      <img
                        src={
                          branding.pwa_icon_192_url
                            ? resolveFileUrl(branding.pwa_icon_192_url)
                            : resolveFileUrl(branding.logo_url!)
                        }
                        alt="App icon preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <img
                        src="/pwa-192x192.png"
                        alt="Default app icon"
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{brandingForm.company_short_name || brandingForm.company_name || "NextIntranet"}</p>
                    <p className="text-xs text-muted-foreground">Home screen icon</p>
                  </div>
                </div>
              </div>
            </div>

            {canManageBranding && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => saveBrandingMutation.mutate(brandingForm)}
                  disabled={!hasBrandingChanges || saveBrandingMutation.isPending}
                >
                  {saveBrandingMutation.isPending ? "Saving..." : "Save branding"}
                </Button>
                {hasBrandingChanges && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setBrandingForm({
                        company_name: branding?.company_name || "",
                        company_short_name: branding?.company_short_name || "",
                        theme_color: branding?.theme_color || "#0f172a",
                        background_color: branding?.background_color || "#ffffff",
                      })
                    }
                  >
                    Reset
                  </Button>
                )}
              </div>
            )}
            {!canManageBranding && (
              <p className="text-xs text-muted-foreground">
                Only administrators can change branding.
              </p>
            )}

            <div className="space-y-2 border-t border-border pt-4">
              <Label>Install app</Label>
              {isInstalled ? (
                <p className="text-sm text-muted-foreground">App is installed.</p>
              ) : isInstallable ? (
                <Button size="sm" onClick={() => installApp()}>
                  <Download className="mr-2 h-4 w-4" />
                  Install app
                </Button>
              ) : isIos ? (
                <p className="text-sm text-muted-foreground">
                  On iOS, tap Share → Add to Home Screen to install.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Install prompt is not available in this browser. Use the browser menu to install
                  the app.
                </p>
              )}
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  )
}
