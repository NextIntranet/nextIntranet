import * as SheetPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal
const SheetOverlay = SheetPrimitive.Overlay
interface SheetContentProps extends React.ComponentProps<typeof SheetPrimitive.Content> {
  side?: "left" | "right" | "top" | "bottom"
}

const SheetContent = ({
  side = "left",
  className,
  children,
  ...props
}: SheetContentProps) => {
  const sideClasses = {
    left: "inset-y-0 left-0 h-full w-full max-w-sm border-r",
    right: "inset-y-0 right-0 h-full w-full max-w-sm border-l",
    top: "inset-x-0 top-0 w-full border-b",
    bottom: "inset-x-0 bottom-0 w-full border-t",
  }

  return (
    <SheetPortal>
      <SheetOverlay className="fixed inset-0 z-50 bg-black/80" />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border border-border bg-background p-6 shadow-lg",
          sideClasses[side],
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = SheetPrimitive.Title
const SheetDescription = SheetPrimitive.Description

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
  SheetOverlay,
}
