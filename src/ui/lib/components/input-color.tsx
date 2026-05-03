export type InputColorProps = {
  value: string
  onChange: (value: string) => void
}

export function InputColor({ value, onChange }: InputColorProps) {
  return (
    <input
      type="color"
      className="input input-xs h-6 w-full p-0 border-none rounded-none"
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  )
}
