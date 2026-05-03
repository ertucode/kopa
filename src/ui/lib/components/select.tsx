export type SelectProps = {
  options: { label: string; value: string }[]
  value: string
  onChange: (value: string) => void
}

export function Select({ options, value, onChange }: SelectProps) {
  return (
    <select className="select select-xs rounded-none" value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => (
        <option value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}
