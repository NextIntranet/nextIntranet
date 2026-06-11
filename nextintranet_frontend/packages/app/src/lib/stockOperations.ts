export type OperationFlow = "in" | "out" | "neutral"
export type OperationMode = "single" | "transfer" | "transfer_separate"

export type OperationOption = {
  value: string
  label: string
  flow?: OperationFlow
  mode: OperationMode
  disabled?: boolean
}

export const OPERATION_OPTIONS: OperationOption[] = [
  { value: "buy", label: "Purchase", flow: "in", mode: "single" },
  { value: "sell", label: "Sale", flow: "out", mode: "single" },
  { value: "service", label: "Service withdrawal", flow: "out", mode: "single" },
  { value: "add", label: "Addition", flow: "in", mode: "single" },
  { value: "inventory", label: "Inventory (inactive)", flow: "neutral", mode: "single", disabled: true },
  { value: "transfer", label: "Transfer (move)", mode: "transfer" },
  { value: "transfer_separate", label: "Transfer (separate)", mode: "transfer_separate" },
]

const OPERATION_LABELS: Record<string, string> = {
  add: "Addition",
  remove: "Removal",
  adjust: "Adjustment",
  trans_in: "Transfer (addition)",
  trans_out: "Transfer (removal)",
  inventory: "Inventory",
  service: "Service withdrawal",
  buy: "Purchase",
  sell: "Sale",
}

const OPERATION_FLOW: Record<string, OperationFlow> = {
  add: "in",
  remove: "out",
  adjust: "neutral",
  trans_in: "in",
  trans_out: "out",
  inventory: "neutral",
  service: "out",
  buy: "in",
  sell: "out",
}

export const getOperationLabel = (operationType: string) =>
  OPERATION_LABELS[operationType] ?? operationType

export const getOperationFlow = (operationType: string) =>
  OPERATION_FLOW[operationType] ?? "neutral"

export const getOperationOption = (operationType: string) =>
  OPERATION_OPTIONS.find((option) => option.value === operationType)
