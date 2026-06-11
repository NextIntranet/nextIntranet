import { toast } from "sonner"

export const copyToClipboard = async (value: string, successMessage: string) => {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(successMessage)
  } catch {
    toast.error("Unable to copy to clipboard.")
  }
}
