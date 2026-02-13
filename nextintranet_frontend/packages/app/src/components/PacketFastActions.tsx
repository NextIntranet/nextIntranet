import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PacketOperationSheet, type PacketOption } from "@/components/PacketOperationSheet"
import { OPERATION_OPTIONS } from "@/lib/stockOperations"

interface PacketFastActionsProps {
  packetId: string
  packetOptions: PacketOption[]
  componentId?: string
  onOperationCreated?: () => void
}

export function PacketFastActions({
  packetId,
  packetOptions,
  componentId,
  onOperationCreated,
}: PacketFastActionsProps) {
  const [selectedOperation, setSelectedOperation] = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)

  const handleOpenChange = (open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      setSelectedOperation("")
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedOperation}
        onChange={(e) => setSelectedOperation(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Select operation"
      >
        <option value="">Operation</option>
        {OPERATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        size="icon"
        variant="secondary"
        onClick={() => setSheetOpen(true)}
        disabled={!selectedOperation}
        aria-label="Add operation"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <PacketOperationSheet
        open={sheetOpen}
        onOpenChange={handleOpenChange}
        packetOptions={packetOptions}
        initialPacketId={packetId}
        initialOperationType={selectedOperation}
        lockOperationType
        showPacketSelect={false}
        showOperationSelect={false}
        componentId={componentId}
        onOperationCreated={onOperationCreated}
      />
    </div>
  )
}
