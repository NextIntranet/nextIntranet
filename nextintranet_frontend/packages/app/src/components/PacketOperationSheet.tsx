import { useEffect, useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiFetch } from "@nextintranet/core"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { OPERATION_OPTIONS, getOperationFlow, getOperationOption } from "@/lib/stockOperations"
import { evalMathExpr } from "@/lib/utils"

export type PacketOption = {
  id: string
  label: string
  locationId?: string | null
  count?: number | null
}

type PacketOperationPayload = {
  packet: string
  operation_type: string
  quantity: number
  relative_quantity: boolean
  unit_price?: number
  description?: string
}

type OperationRequest = {
  mode: "single" | "transfer" | "transfer_separate"
  payload: PacketOperationPayload
  targetPacketId?: string
  componentId?: string
  sourceLocationId?: string | null
}

interface PacketOperationSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  packetOptions: PacketOption[]
  initialPacketId?: string
  initialOperationType?: string
  lockOperationType?: boolean
  showPacketSelect?: boolean
  showOperationSelect?: boolean
  componentId?: string
  onOperationCreated?: () => void
}

export function PacketOperationSheet({
  open,
  onOpenChange,
  packetOptions,
  initialPacketId,
  initialOperationType,
  lockOperationType = false,
  showPacketSelect = true,
  showOperationSelect = true,
  componentId,
  onOperationCreated,
}: PacketOperationSheetProps) {
  const defaultPacketId = useMemo(() => {
    if (initialPacketId) {
      return initialPacketId
    }
    return packetOptions[0]?.id ?? ""
  }, [initialPacketId, packetOptions])

  const [formState, setFormState] = useState({
    packetId: "",
    operationType: "",
    quantity: "",
    unitPrice: "",
    description: "",
    targetPacketId: "",
  })

  useEffect(() => {
    if (!open) {
      return
    }
    setFormState({
      packetId: defaultPacketId,
      operationType: initialOperationType || "",
      quantity: "",
      unitPrice: "",
      description: "",
      targetPacketId: "",
    })
  }, [open, defaultPacketId, initialOperationType])

  const createOperationMutation = useMutation({
    mutationFn: async (request: OperationRequest) => {
      if (request.mode === "transfer" || request.mode === "transfer_separate") {
        const targetPacketId =
          request.mode === "transfer" ? request.targetPacketId : undefined
        const sourcePacketId = request.payload.packet
        const quantity = Math.abs(request.payload.quantity)
        const description = request.payload.description

        if (request.mode === "transfer") {
          if (!targetPacketId) {
            throw new Error("Missing destination packet.")
          }
          await apiFetch("/api/v1/store/packet/operation/", {
            method: "POST",
            body: JSON.stringify({
              packet: sourcePacketId,
              operation_type: "trans_out",
              quantity: -quantity,
              relative_quantity: true,
              description,
            }),
          })
          await apiFetch("/api/v1/store/packet/operation/", {
            method: "POST",
            body: JSON.stringify({
              packet: targetPacketId,
              operation_type: "trans_in",
              quantity,
              relative_quantity: true,
              description,
            }),
          })
          return
        }

        if (!request.componentId || !request.sourceLocationId) {
          throw new Error("Missing component or location for split transfer.")
        }
        const newPacket = await apiFetch<{ id: string }>(
          `/api/v1/store/component/${request.componentId}/packet/`,
          {
            method: "POST",
            body: JSON.stringify({
              component: request.componentId,
              location: request.sourceLocationId,
              count: 0,
              description: null,
              is_active: true,
            }),
          },
        )
        await apiFetch("/api/v1/store/packet/operation/", {
          method: "POST",
          body: JSON.stringify({
            packet: sourcePacketId,
            operation_type: "trans_out",
            quantity: -quantity,
            relative_quantity: true,
            description,
          }),
        })
        await apiFetch("/api/v1/store/packet/operation/", {
          method: "POST",
          body: JSON.stringify({
            packet: newPacket.id,
            operation_type: "trans_in",
            quantity,
            relative_quantity: true,
            description,
          }),
        })
        return
      }

      await apiFetch("/api/v1/store/packet/operation/", {
        method: "POST",
        body: JSON.stringify(request.payload),
      })
    },
    onSuccess: () => {
      toast.success("Operation added.")
      onOperationCreated?.()
      onOpenChange(false)
    },
    onError: () => {
      toast.error("Failed to add operation.")
    },
  })

  const selectedPacketLabel =
    packetOptions.find((packet) => packet.id === formState.packetId)?.label || "-"
  const selectedOperation = getOperationOption(formState.operationType)
  const isTransfer = selectedOperation?.mode === "transfer"
  const isSeparateTransfer = selectedOperation?.mode === "transfer_separate"
  const isSingleOperation = selectedOperation?.mode === "single"
  const isServiceOperation = selectedOperation?.value === "service"

  const quantityRaw = formState.quantity.trim()
  const unitPriceValue = formState.unitPrice.trim() === "" ? null : Number(formState.unitPrice)
  const isUnitPriceValid =
    unitPriceValue === null || (!Number.isNaN(unitPriceValue) && unitPriceValue >= 0)
  const hasTargetPacket =
    formState.targetPacketId.trim() !== "" && formState.targetPacketId !== formState.packetId
  const sourcePacket = packetOptions.find((packet) => packet.id === formState.packetId)
  const sourcePacketLocation = sourcePacket?.locationId
  const sourcePacketCount = sourcePacket?.count ?? null
  const canSeparateTransfer = Boolean(componentId && sourcePacketLocation)
  const parseQuantity = () => {
    if (quantityRaw === "") {
      return { valid: false, value: 0 }
    }
    if (isServiceOperation && quantityRaw.startsWith("=")) {
      const targetValue = evalMathExpr(quantityRaw.slice(1).trim())
      if (targetValue === null || sourcePacketCount === null) {
        return { valid: false, value: 0 }
      }
      const delta = targetValue - sourcePacketCount
      return { valid: delta !== 0, value: delta }
    }
    const parsed = evalMathExpr(quantityRaw)
    if (parsed === null) {
      return { valid: false, value: 0 }
    }
    if (isServiceOperation) {
      return { valid: parsed !== 0, value: parsed }
    }
    return { valid: parsed > 0, value: parsed }
  }
  const parsedQuantity = parseQuantity()
  const isQuantityValid = parsedQuantity.valid

  const canSubmit =
    formState.packetId.trim() !== "" &&
    formState.operationType.trim() !== "" &&
    isQuantityValid &&
    isUnitPriceValid &&
    (isSingleOperation || (isTransfer && hasTargetPacket) || (isSeparateTransfer && canSeparateTransfer)) &&
    !createOperationMutation.isPending

  const handleSubmit = () => {
    if (!canSubmit) {
      return
    }
    const baseDescription = formState.description.trim() || undefined
    const quantityValue = parsedQuantity.value
    const flow = getOperationFlow(formState.operationType)
    const signedQuantity = isServiceOperation
      ? quantityValue
      : flow === "out"
        ? -Math.abs(quantityValue)
        : Math.abs(quantityValue)
    const payload: PacketOperationPayload = {
      packet: formState.packetId,
      operation_type: formState.operationType,
      quantity: signedQuantity,
      relative_quantity: true,
    }
    if (unitPriceValue !== null && !Number.isNaN(unitPriceValue)) {
      payload.unit_price = unitPriceValue
    }
    if (baseDescription) {
      payload.description = baseDescription
    }
    if (isTransfer || isSeparateTransfer) {
      createOperationMutation.mutate({
        mode: isTransfer ? "transfer" : "transfer_separate",
        payload: {
          packet: formState.packetId,
          operation_type: formState.operationType,
          quantity: Math.abs(quantityValue),
          relative_quantity: true,
          description: baseDescription,
        },
        targetPacketId: formState.targetPacketId,
        componentId,
        sourceLocationId: sourcePacketLocation,
      })
      return
    }

    createOperationMutation.mutate({
      mode: "single",
      payload,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg">
        <SheetHeader>
          <SheetTitle>Add operation</SheetTitle>
          <SheetDescription>
            Record a new packet operation and update stock levels.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {showPacketSelect ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Packet</label>
              <select
                value={formState.packetId}
                onChange={(e) =>
                  setFormState({ ...formState, packetId: e.target.value })
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select packet</option>
                {packetOptions.map((packet) => (
                  <option key={packet.id} value={packet.id}>
                    {packet.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Packet</span>
              <span className="ml-2 font-medium text-foreground">{selectedPacketLabel}</span>
            </div>
          )}

          {showOperationSelect ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Operation type</label>
              <select
                value={formState.operationType}
                onChange={(e) =>
                  setFormState({ ...formState, operationType: e.target.value })
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={lockOperationType}
              >
                <option value="">Select operation</option>
                {OPERATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Operation</span>
              <span className="ml-2 font-medium text-foreground">
                {selectedOperation?.label || "-"}
              </span>
            </div>
          )}

          {isTransfer && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Destination packet</label>
              <select
                value={formState.targetPacketId}
                onChange={(e) =>
                  setFormState({ ...formState, targetPacketId: e.target.value })
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select packet</option>
                {packetOptions
                  .filter((packet) => packet.id !== formState.packetId)
                  .map((packet) => (
                    <option key={packet.id} value={packet.id}>
                      {packet.label}
                    </option>
                  ))}
              </select>
              {!packetOptions.some((packet) => packet.id !== formState.packetId) && (
                <p className="text-xs text-muted-foreground">
                  No other packets available for transfer.
                </p>
              )}
            </div>
          )}

          {isSeparateTransfer && (
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              <div className="text-muted-foreground">Transfer mode</div>
              <div className="font-medium text-foreground">
                Split into a new packet at the same location
              </div>
              {!canSeparateTransfer && (
                <p className="mt-2 text-xs text-muted-foreground">
                  A source packet with a location is required to split.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Quantity</label>
              <Input
                type={isServiceOperation ? "text" : "number"}
                inputMode={isServiceOperation ? "text" : "decimal"}
                step={isServiceOperation ? undefined : "0.01"}
                value={formState.quantity}
                onChange={(e) =>
                  setFormState({ ...formState, quantity: e.target.value })
                }
                placeholder={isServiceOperation ? "-5 or =10 or 50+50" : "0"}
              />
              {isServiceOperation && (
                <p className="text-xs text-muted-foreground">
                  Note: negative values withdraw stock, positive values add stock. Use
                  {" "}{"="}10 to target a new total of 10 units. Arithmetic expressions like 50+50 are supported.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Unit price (optional)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formState.unitPrice}
                onChange={(e) =>
                  setFormState({ ...formState, unitPrice: e.target.value })
                }
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              value={formState.description}
              onChange={(e) =>
                setFormState({ ...formState, description: e.target.value })
              }
              className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Optional notes"
            />
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {createOperationMutation.isPending ? "Adding..." : "Add operation"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
