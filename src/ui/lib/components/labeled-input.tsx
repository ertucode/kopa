export type LabeledInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
}

export function LabeledInput({ label, value, onChange }: LabeledInputProps) {
  return (
    <label className="input form-control gap-1 max-h-6 p-0 rounded-none outline-offset-0 focus-within:outline-1">
      <span className="label text-[11px] px-1 m-0">{label}</span>
      <input
        className="input input-xs rounded-none outline-none p-0 pb-[1.5px]"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  )
}
