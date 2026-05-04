export type SelectProps = {
  options: { label: string; value: string }[]
  value: string
  onChange: (value: string) => void
}

export function Select({ options, value, onChange }: SelectProps) {
  return (
    <select
      className="select select-xs rounded-none focus-within:outline-1 outline-offset-0"
      value={value}
      onChange={event => onChange(event.target.value)}
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
