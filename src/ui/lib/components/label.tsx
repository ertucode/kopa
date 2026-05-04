import { twMerge } from 'tailwind-merge'

export type LabelProps = {
  children: string
  className?: string
}

export function Label({ children, className }: LabelProps) {
  return (
    <span
      className={twMerge(
        'text-xs text-base-content/50 w-22 overflow-hidden overflow-ellipsis whitespace-nowrap',
        className
      )}
    >
      {children}
    </span>
  )
}
