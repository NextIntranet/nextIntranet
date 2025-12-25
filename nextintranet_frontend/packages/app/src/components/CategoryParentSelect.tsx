import Select, { type StylesConfig, type SingleValue } from "react-select"

interface CategoryNode {
  id: string
  name: string
  children?: CategoryNode[]
}

type CategoryOption = {
  value: string
  label: string
  name: string
  depth: number
}

const selectStyles: StylesConfig<CategoryOption, false> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "hsl(var(--background))",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--input))",
    boxShadow: state.isFocused ? "0 0 0 2px hsl(var(--ring))" : base.boxShadow,
    ":hover": {
      borderColor: "hsl(var(--ring))",
    },
  }),
  menu: (base) => ({
    ...base,
    zIndex: 30,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "hsl(var(--accent))"
      : state.isFocused
        ? "hsl(var(--muted))"
        : "transparent",
    color: "hsl(var(--foreground))",
  }),
  placeholder: (base) => ({
    ...base,
    color: "hsl(var(--muted-foreground))",
  }),
  singleValue: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
  }),
}

const buildOptions = (
  nodes: CategoryNode[],
  excludeId?: string,
  depth = 0,
  parentPath = "",
  options: CategoryOption[] = [],
): CategoryOption[] => {
  nodes.forEach((node) => {
    if (node.id !== excludeId) {
      const path = parentPath ? `${parentPath} / ${node.name}` : node.name
      options.push({
        value: node.id,
        label: path,
        name: node.name,
        depth,
      })
      if (node.children && node.children.length > 0) {
        buildOptions(node.children, excludeId, depth + 1, path, options)
      }
    }
  })
  return options
}

type Props = {
  categories: CategoryNode[]
  value: string | null
  onChange: (value: string | null) => void
  excludeId?: string
  isDisabled?: boolean
  emptyLabel?: string
  placeholder?: string
}

export function CategoryParentSelect({
  categories,
  value,
  onChange,
  excludeId,
  isDisabled = false,
  emptyLabel = "No parent",
  placeholder = "Select parent category",
}: Props) {
  const options = [{ value: "", label: emptyLabel, name: emptyLabel, depth: 0 }].concat(
    buildOptions(categories, excludeId),
  )
  const selected = options.find((option) => option.value === (value ?? "")) || options[0]

  return (
    <Select
      classNamePrefix="rs"
      isSearchable
      isClearable={false}
      options={options}
      value={selected}
      placeholder={placeholder}
      styles={selectStyles}
      isDisabled={isDisabled}
      onChange={(option: SingleValue<CategoryOption>) =>
        onChange(option?.value ? option.value : null)
      }
      formatOptionLabel={(option, { context }) => {
        if (option.value === "") {
          return option.name
        }
        if (context === "value") {
          return option.label
        }
        return (
          <div style={{ paddingLeft: `${option.depth * 14}px` }}>{option.name}</div>
        )
      }}
    />
  )
}
