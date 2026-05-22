import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type TreeNode = {
  id: string
  name: string
  children?: TreeNode[]
}

export type TreeExpandCommand = {
  action: 'expand' | 'collapse'
  nonce: number
}

type Props = {
  data: TreeNode[]
  level?: number
  multiSelect?: boolean
  selectedIds?: string[]
  selectedId?: string | null
  onToggle?: (id: string) => void
  onSelect?: (id: string | null) => void
  showCheckbox?: boolean
  /** When set, all nodes expand or collapse (triggered by nonce change). */
  expandCommand?: TreeExpandCommand
}

function hasSelectedDescendant(node: TreeNode, selectedSet: Set<string>): boolean {
  if (!node.children?.length) {
    return false
  }
  for (const child of node.children) {
    if (selectedSet.has(child.id)) {
      return true
    }
    if (hasSelectedDescendant(child, selectedSet)) {
      return true
    }
  }
  return false
}

function getNodeCheckState(
  node: TreeNode,
  selectedIds: string[],
): 'checked' | 'indeterminate' | 'unchecked' {
  const selectedSet = new Set(selectedIds)
  if (selectedSet.has(node.id)) {
    return 'checked'
  }
  if (hasSelectedDescendant(node, selectedSet)) {
    return 'indeterminate'
  }
  return 'unchecked'
}

export function TreeFilter({
  data,
  level = 0,
  multiSelect = true,
  selectedIds = [],
  selectedId = null,
  onToggle,
  onSelect,
  showCheckbox = false,
  expandCommand,
}: Props) {
  const paddingLeft = level * 14 + 6
  return (
    <div className="space-y-0.5">
      {data.map((node) => (
        <NodeRow
          key={node.id}
          node={node}
          level={level}
          paddingLeft={paddingLeft}
          multiSelect={multiSelect}
          selectedIds={selectedIds}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelect={onSelect}
          showCheckbox={showCheckbox}
          expandCommand={expandCommand}
        />
      ))}
    </div>
  )
}

function NodeRow({
  node,
  level,
  paddingLeft,
  multiSelect,
  selectedIds,
  selectedId,
  onToggle,
  onSelect,
  showCheckbox = false,
  expandCommand,
}: {
  node: TreeNode
  level: number
  paddingLeft: number
  multiSelect: boolean
  selectedIds: string[]
  selectedId: string | null
  onToggle?: (id: string) => void
  onSelect?: (id: string | null) => void
  showCheckbox?: boolean
  expandCommand?: TreeExpandCommand
}) {
  const hasChildren = !!node.children && node.children.length > 0
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!expandCommand) {
      return
    }
    setOpen(expandCommand.action === 'expand')
  }, [expandCommand?.nonce, expandCommand?.action])

  const checkState = multiSelect
    ? getNodeCheckState(node, selectedIds)
    : selectedId === node.id
      ? 'checked'
      : 'unchecked'
  const isChecked = checkState === 'checked'
  const isIndeterminate = checkState === 'indeterminate'

  const handleCheck = () => {
    if (multiSelect) {
      onToggle?.(node.id)
    } else {
      onSelect?.(isChecked ? null : node.id)
    }
  }

  const checkboxChecked = isIndeterminate ? 'indeterminate' : isChecked

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded-sm px-1 py-1 text-sm transition-colors',
          'hover:bg-accent/40',
          isChecked && 'font-medium text-primary',
          isIndeterminate && 'font-medium text-primary/80',
        )}
        style={{ paddingLeft: paddingLeft }}
      >
        {hasChildren ? (
          <Collapsible open={open} onOpenChange={setOpen}>
            <div className="flex items-center gap-1">
              <CollapsibleTrigger className="grid h-5 w-5 place-items-center hover:text-foreground">
                <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
              </CollapsibleTrigger>
              {showCheckbox && (
                <Checkbox
                  checked={checkboxChecked}
                  onCheckedChange={handleCheck}
                  className="h-4 w-4"
                />
              )}
              <span
                className="truncate cursor-pointer"
                onClick={() => (multiSelect ? onToggle?.(node.id) : onSelect?.(node.id))}
                title={node.name}
              >
                {node.name}
              </span>
            </div>
            <CollapsibleContent>
              {node.children && node.children.length > 0 && (
                <TreeFilter
                  data={node.children}
                  level={level + 1}
                  multiSelect={multiSelect}
                  selectedIds={selectedIds}
                  selectedId={selectedId}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  showCheckbox={showCheckbox}
                  expandCommand={expandCommand}
                />
              )}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <div className="flex items-center gap-1">
            <span className="inline-block h-5 w-5" />
            {showCheckbox && (
              <Checkbox
                checked={checkboxChecked}
                onCheckedChange={handleCheck}
                className="h-4 w-4"
              />
            )}
            <span
              className="truncate cursor-pointer"
              onClick={() => (multiSelect ? onToggle?.(node.id) : onSelect?.(node.id))}
              title={node.name}
            >
              {node.name}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
