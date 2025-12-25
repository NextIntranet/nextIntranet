import { useState } from 'react';

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
}

interface TreeViewProps {
  data: TreeNode[];
  selectedIds?: string[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  multiSelect?: boolean;
  level?: number;
}

const styles = {
  treeNode: {
    userSelect: 'none' as const,
  },
  nodeHeader: (level: number, isSelected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '0.25rem 0.5rem',
    paddingLeft: `${level * 16 + 8}px`,
    cursor: 'pointer',
    fontSize: '0.875rem',
    color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
    fontWeight: isSelected ? 500 : 400,
    borderRadius: 'var(--radius-sm)',
    transition: 'all 0.15s',
    backgroundColor: isSelected ? 'var(--color-bg-tertiary)' : 'transparent',
  }),
  expandButton: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    transition: 'transform 0.2s',
  },
  checkbox: {
    marginRight: '0.5rem',
    cursor: 'pointer',
  },
  nodeName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};

export function TreeView({
  data,
  selectedIds = [],
  selectedId = null,
  onSelect,
  onToggle,
  multiSelect = false,
  level = 0,
}: TreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelect = (id: string) => {
    if (onSelect) {
      onSelect(id);
    }
    if (onToggle) {
      onToggle(id);
    }
  };

  const isSelected = (id: string) => {
    if (multiSelect) {
      return selectedIds.includes(id);
    }
    return selectedId === id;
  };

  return (
    <>
      {data.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(node.id);
        const selected = isSelected(node.id);

        return (
          <div key={node.id} style={styles.treeNode}>
            <div
              style={styles.nodeHeader(level, selected)}
              onClick={() => handleSelect(node.id)}
              onMouseEnter={(e) => {
                if (!selected) {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!selected) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {hasChildren ? (
                <span
                  style={{
                    ...styles.expandButton,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                  onClick={(e) => toggleExpand(node.id, e)}
                >
                  ▸
                </span>
              ) : (
                <span style={{ ...styles.expandButton, visibility: 'hidden' }} />
              )}
              
              {multiSelect && (
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => handleSelect(node.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={styles.checkbox}
                />
              )}
              
              <span style={styles.nodeName} title={node.name}>
                {node.name}
              </span>
            </div>

            {hasChildren && isExpanded && (
              <TreeView
                data={node.children!}
                selectedIds={selectedIds}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggle={onToggle}
                multiSelect={multiSelect}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
