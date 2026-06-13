import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { KbdKeys } from "@/components/ui/kbd"
import { useHotkeysHelp } from "@/lib/hotkeys"

export function HotkeysHelpDialog() {
  const { groups, helpOpen, setHelpOpen } = useHotkeysHelp()

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts available right now — page-specific ones appear when the
            page is open.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </h3>
              <ul className="divide-y divide-border/50 rounded-md border border-border/70">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-1.5"
                  >
                    <span className="text-sm text-foreground">{item.description}</span>
                    <KbdKeys keys={item.keys} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
