import { ReactNode } from 'react'

export type InputColorProps = {
  value: string
  onChange: (value: string) => void
  overlay?: ReactNode
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function InputColor({ value, onChange, overlay }: InputColorProps) {
  const displayValue = HEX_COLOR_PATTERN.test(value) ? value : '#000000'

  return (
    <div className="relative w-full">
      <input
        type="color"
        className="input input-xs h-6 w-full rounded-none border-none p-0"
        value={displayValue}
        onChange={event => onChange(event.target.value)}
      />
      {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}
    </div>
  )
}
