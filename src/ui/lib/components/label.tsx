import { twMerge } from 'tailwind-merge'
import { ReactNode } from 'react'

export type LabelProps = {
  children: ReactNode
  className?: string
}

export function Label({ children, className }: LabelProps) {
  return (
    <span
      className={twMerge(
        'text-xs text-base-content/50 w-26 overflow-hidden overflow-ellipsis whitespace-nowrap flex-grow-0 flex-shrink-0',
        className
      )}
    >
      {children}
    </span>
  )
}
