import Select, { type StylesConfig, type SingleValue } from 'react-select';

interface LocationNode {
  id: string;
  name: string;
  full_path: string;
  children?: LocationNode[];
}

type LocationOption = {
  value: string;
  label: string;
  name: string;
  depth: number;
};

const selectStyles: StylesConfig<LocationOption, false> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: 'hsl(var(--background))',
    borderColor: state.isFocused ? 'hsl(var(--ring))' : 'hsl(var(--input))',
    boxShadow: state.isFocused ? '0 0 0 2px hsl(var(--ring))' : base.boxShadow,
    ':hover': {
      borderColor: 'hsl(var(--ring))',
    },
  }),
  menu: (base) => ({
    ...base,
    zIndex: 30,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? 'hsl(var(--accent))'
      : state.isFocused
        ? 'hsl(var(--muted))'
        : 'transparent',
    color: 'hsl(var(--foreground))',
  }),
  placeholder: (base) => ({
    ...base,
    color: 'hsl(var(--muted-foreground))',
  }),
  singleValue: (base) => ({
    ...base,
    color: 'hsl(var(--foreground))',
  }),
};

const buildOptions = (
  nodes: LocationNode[],
  excludeId?: string,
  depth = 0,
  options: LocationOption[] = []
): LocationOption[] => {
  nodes.forEach((node) => {
    if (node.id !== excludeId) {
      options.push({
        value: node.id,
        label: node.full_path,
        name: node.name,
        depth,
      });
      if (node.children && node.children.length > 0) {
        buildOptions(node.children, excludeId, depth + 1, options);
      }
    }
  });
  return options;
};

type Props = {
  locations: LocationNode[];
  value: string | null;
  onChange: (value: string | null) => void;
  excludeId?: string;
  isDisabled?: boolean;
  emptyLabel?: string;
  placeholder?: string;
};

export function LocationParentSelect({
  locations,
  value,
  onChange,
  excludeId,
  isDisabled = false,
  emptyLabel = 'No parent',
  placeholder = 'Select parent location',
}: Props) {
  const options = [{ value: '', label: emptyLabel, name: emptyLabel, depth: 0 }].concat(
    buildOptions(locations, excludeId)
  );
  const selected = options.find((option) => option.value === (value ?? '')) || options[0];

  return (
    <Select
      classNamePrefix="rs"
      isSearchable
      isClearable={false}
      options={options}
      value={selected}
      placeholder={placeholder}
      menuPlacement="auto"
      styles={selectStyles}
      isDisabled={isDisabled}
      onChange={(option: SingleValue<LocationOption>) =>
        onChange(option?.value ? option.value : null)
      }
      formatOptionLabel={(option, { context }) => {
        if (option.value === '') {
          return option.name;
        }
        if (context === 'value') {
          return option.label;
        }
        return (
          <div style={{ paddingLeft: `${option.depth * 14}px` }}>
            {option.name}
          </div>
        );
      }}
    />
  );
}
