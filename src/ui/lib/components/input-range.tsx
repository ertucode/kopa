import { GridCols } from './grid-cols'
import { Input } from './input'

export type InputRangeProps = {
  value: number
  onChange: (value: string) => void
}

export function InputRange({ value, onChange }: InputRangeProps) {
  return (
    <GridCols>
      <Input type="range" min="0.05" max="1" step="0.05" className="range range-xs" value={value} onChange={onChange} />
      <span className="w-10 text-right text-xs">{Math.round(value * 100)}%</span>
    </GridCols>
  )
}
