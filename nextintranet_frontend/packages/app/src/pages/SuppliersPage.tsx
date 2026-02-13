import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Copy, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { usePluginInstances } from "@/plugins/usePluginInstances"

interface Supplier {
  id: string
  name: string
  contact_info?: string | null
  website?: string | null
  link_template?: string | null
  min_order_quantity?: number | null
  api_plugin_instance?: string | null
  api_config?: Record<string, unknown> | null
  api_mapping?: Record<string, unknown> | null
  api_last_sync_at?: string | null
}

interface PaginatedSuppliers {
  results: Supplier[]
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

type EditMode = "detail" | "edit"

const API_TEMPLATES = {
  mouser: {
    label: "Mouser (search/partnumber)",
    config: {
      base_url: "https://api.mouser.com/api/v1/search/partnumber",
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
      query_params: {
        apiKey: "YOUR_MOUSER_API_KEY",
      },
      body: {
        SearchByPartRequest: {
          mouserPartNumber: "{symbol}",
        },
      },
      response_path: "SearchResults.Parts.0",
    },
    mapping: {
      fields: {
        name: {
          source: "ManufacturerPartNumber",
          target: "component.name",
          policy: "if_empty",
        },
        description: {
          source: "Description",
          target: "component.description",
          policy: "if_empty",
        },
        primary_image: {
          source: "ImagePath",
          target: "component.primary_image",
          policy: "if_empty",
        },
        datasheet: {
          source: "DataSheetUrl",
          target: "component.documents",
          policy: "append",
        },
        parameters: {
          source: "ProductAttributes",
          target: "component.parameters",
          policy: "append",
          item_map: {
            name: "AttributeName",
            value: "AttributeValue",
          },
        },
      },
    },
  },
  tme: {
    label: "TME (GetProducts.json)",
    config: {
      base_url: "https://api.tme.eu/Products/GetProducts.json",
      method: "GET",
      headers: {
        accept: "application/json",
        Token: "YOUR_TME_TOKEN",
      },
      query_params: {
        Token: "YOUR_TME_TOKEN",
        Symbol: "{symbol}",
        Country: "CZ",
        Language: "en",
      },
      response_path: "Data.0",
    },
    mapping: {
      fields: {},
    },
  },
} as const

type ApiTemplateKey = keyof typeof API_TEMPLATES

export function SuppliersPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mode: EditMode = searchParams.get("mode") === "edit" ? "edit" : "detail"

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const { data: suppliersData, isLoading: isSuppliersLoading } = useQuery<
    Supplier[] | PaginatedSuppliers
  >({
    queryKey: ["suppliers"],
    queryFn: () => apiFetch<Supplier[] | PaginatedSuppliers>("/api/v1/store/supplier/?page_size=1000"),
  })

  const suppliers = Array.isArray(suppliersData) ? suppliersData : suppliersData?.results || []

  const { data: pluginInstances } = usePluginInstances()

  const { data: supplierDetail, isLoading: isDetailLoading } = useQuery<Supplier>({
    queryKey: ["supplier", id],
    queryFn: () => apiFetch<Supplier>(`/api/v1/store/supplier/${id}/`),
    enabled: !!id,
  })

  const [formState, setFormState] = useState({
    name: "",
    website: "",
    link_template: "",
    min_order_quantity: "",
    contact_info: "",
    api_plugin_instance: "",
    api_config: "",
    api_mapping: "",
  })
  const [apiTemplateKey, setApiTemplateKey] = useState<ApiTemplateKey | "">("")

  useEffect(() => {
    if (!supplierDetail) {
      return
    }
    setFormState({
      name: supplierDetail.name || "",
      website: supplierDetail.website || "",
      link_template: supplierDetail.link_template || "",
      min_order_quantity:
        supplierDetail.min_order_quantity !== null && supplierDetail.min_order_quantity !== undefined
          ? String(supplierDetail.min_order_quantity)
          : "",
      contact_info: supplierDetail.contact_info || "",
      api_plugin_instance: supplierDetail.api_plugin_instance || "",
      api_config: supplierDetail.api_config ? JSON.stringify(supplierDetail.api_config, null, 2) : "",
      api_mapping: supplierDetail.api_mapping
        ? JSON.stringify(supplierDetail.api_mapping, null, 2)
        : "",
    })
  }, [supplierDetail?.id])

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.find(
      (permission) => permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
    )

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<Supplier>) =>
      apiFetch(`/api/v1/store/supplier/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] })
      queryClient.invalidateQueries({ queryKey: ["supplier", id] })
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete("mode")
        return next
      })
      toast.success("Supplier updated.")
    },
    onError: () => {
      toast.error("Failed to update supplier.")
    },
  })

  const handleOpen = (supplierId: string) => {
    navigate(`/store/supplier/${supplierId}`)
  }

  const handleCloseSheet = () => {
    setSearchParams(new URLSearchParams())
    navigate("/store/supplier", { replace: true })
  }

  const handleEditMode = (nextMode: EditMode) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      if (nextMode === "edit") {
        next.set("mode", "edit")
      } else {
        next.delete("mode")
      }
      return next
    })
  }

  const handleSave = () => {
    if (!id) {
      return
    }
    let apiMapping: Record<string, unknown> | null = null
    const mappingValue = formState.api_mapping.trim()
    if (mappingValue) {
      try {
        apiMapping = JSON.parse(mappingValue) as Record<string, unknown>
      } catch {
        toast.error("API mapping must be valid JSON.")
        return
      }
    }
    let apiConfig: Record<string, unknown> | null = null
    const configValue = formState.api_config.trim()
    if (configValue) {
      try {
        apiConfig = JSON.parse(configValue) as Record<string, unknown>
      } catch {
        toast.error("API config must be valid JSON.")
        return
      }
    }
    const minOrderQuantity = formState.min_order_quantity.trim()
    updateMutation.mutate({
      name: formState.name.trim(),
      website: formState.website.trim() || null,
      link_template: formState.link_template.trim() || null,
      min_order_quantity: minOrderQuantity ? Number(minOrderQuantity) : null,
      contact_info: formState.contact_info.trim() || null,
      api_plugin_instance: formState.api_plugin_instance || null,
      api_config: apiConfig,
      api_mapping: apiMapping,
    })
  }

  const handleApplyTemplate = () => {
    if (!apiTemplateKey) {
      toast.error("Select an API template first.")
      return
    }
    const template = API_TEMPLATES[apiTemplateKey]
    setFormState((prev) => ({
      ...prev,
      api_config: JSON.stringify(template.config, null, 2),
      api_mapping: JSON.stringify(template.mapping, null, 2),
    }))
    toast.success("API template applied.")
  }

  const handleCopyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Link copied.")
    } catch {
      toast.error("Unable to copy link.")
    }
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Suppliers</h1>
            <p className="text-sm text-muted-foreground">
              Browse and manage supplier records.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="overflow-hidden rounded-lg border border-border/70">
            <Table className="w-full table-fixed">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-border/50">
                  <TableHead className="h-9 w-[30%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="h-9 w-[30%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Website
                  </TableHead>
                  <TableHead className="h-9 w-[40%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Contact info
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isSuppliersLoading ? (
                  <TableRow className="border-border/40">
                    <TableCell colSpan={3} className="py-8">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-5 w-2/3" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : suppliers.length ? (
                  suppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="border-border/40">
                      <TableCell className="h-9 px-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpen(supplier.id)}
                          className="h-7 min-w-0 justify-start px-2 font-normal text-primary hover:underline"
                        >
                          <span className="truncate">{supplier.name}</span>
                        </Button>
                      </TableCell>
                      <TableCell className="h-9 px-3">
                        {supplier.website ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={supplier.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-w-0 truncate text-primary hover:underline"
                                >
                                  {supplier.website}
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>{supplier.website}</TooltipContent>
                            </Tooltip>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopyLink(supplier.website as string)}
                              aria-label="Copy website link"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                        {supplier.contact_info || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="border-border/40">
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No suppliers found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Sheet open={!!id} onOpenChange={(open) => (!open ? handleCloseSheet() : null)}>
          <SheetContent side="right" className="w-full max-w-lg" style={{ overflowY: "auto" }}>
            <SheetHeader>
              <SheetTitle>{mode === "edit" ? "Edit supplier" : "Supplier details"}</SheetTitle>
            </SheetHeader>

            {isDetailLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : supplierDetail ? (
              <div className="mt-6 space-y-4">
                {mode === "detail" ? (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Name</p>
                      <p className="text-sm text-foreground">{supplierDetail.name}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Website
                      </p>
                      {supplierDetail.website ? (
                        <a
                          href={supplierDetail.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          {supplierDetail.website}
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Minimum order quantity
                        </p>
                        <p className="text-sm text-foreground">
                          {supplierDetail.min_order_quantity ?? "-"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Link template
                        </p>
                        <p className="text-sm text-foreground">
                          {supplierDetail.link_template || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Contact info
                      </p>
                      <p className="text-sm text-foreground">
                        {supplierDetail.contact_info || "No contact info."}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        API plugin
                      </p>
                      <p className="text-sm text-foreground">
                        {supplierDetail.api_plugin_instance ? "Configured" : "Not configured"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        API config
                      </p>
                      <p className="text-sm text-foreground">
                        {supplierDetail.api_config && Object.keys(supplierDetail.api_config).length
                          ? "Configured"
                          : "Not configured"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Last API sync
                      </p>
                      <p className="text-sm text-foreground">
                        {supplierDetail.api_last_sync_at
                          ? new Date(supplierDetail.api_last_sync_at).toLocaleString()
                          : "-"}
                      </p>
                    </div>
                    {canEdit && (
                      <Button className="mt-2 w-full gap-2" onClick={() => handleEditMode("edit")}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Name</label>
                      <Input
                        value={formState.name}
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        placeholder="Supplier name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Website</label>
                      <Input
                        value={formState.website}
                        onChange={(e) => setFormState({ ...formState, website: e.target.value })}
                        placeholder="https://"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Link template
                      </label>
                      <Input
                        value={formState.link_template}
                        onChange={(e) =>
                          setFormState({ ...formState, link_template: e.target.value })
                        }
                        placeholder="https://example.com/{symbol}"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Minimum order quantity
                      </label>
                      <Input
                        type="number"
                        value={formState.min_order_quantity}
                        onChange={(e) =>
                          setFormState({ ...formState, min_order_quantity: e.target.value })
                        }
                        placeholder="1"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Contact info</label>
                      <textarea
                        value={formState.contact_info}
                        onChange={(e) =>
                          setFormState({ ...formState, contact_info: e.target.value })
                        }
                        className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Contact details"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">API plugin</label>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={formState.api_plugin_instance}
                        onChange={(e) =>
                          setFormState({ ...formState, api_plugin_instance: e.target.value })
                        }
                      >
                        <option value="">No API plugin</option>
                        {(pluginInstances || [])
                          .filter((instance) => instance.capabilities?.includes("component.actions"))
                          .map((instance) => (
                            <option key={instance.id} value={instance.id}>
                              {instance.name} ({instance.definition_key})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">API template</label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={apiTemplateKey}
                          onChange={(e) =>
                            setApiTemplateKey(e.target.value as ApiTemplateKey | "")
                          }
                        >
                          <option value="">Select template</option>
                          {Object.entries(API_TEMPLATES).map(([key, template]) => (
                            <option key={key} value={key}>
                              {template.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleApplyTemplate}
                        >
                          Load template
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">API config</label>
                      <textarea
                        value={formState.api_config}
                        onChange={(e) =>
                          setFormState({ ...formState, api_config: e.target.value })
                        }
                        className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder='{"base_url": "https://api.example.com", "headers": {"Token": "..."}}'
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">API mapping</label>
                      <textarea
                        value={formState.api_mapping}
                        onChange={(e) =>
                          setFormState({ ...formState, api_mapping: e.target.value })
                        }
                        className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder='{"fields": {"name": {"source": "name", "target": "component.name"}}}'
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleEditMode("detail")}
                        disabled={updateMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                Supplier details are not available.
              </p>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}
