import { clsx } from '../functions/clsx'

type HtmlInputProps = React.ComponentProps<'input'>

export type InputProps = {
  onChange: (value: string) => void
} & Omit<HtmlInputProps, 'onChange'>

export function Input({ className, onChange, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={clsx('input input-xs rounded-none', className)}
      onChange={event => onChange(event.target.value)}
    />
  )
}
