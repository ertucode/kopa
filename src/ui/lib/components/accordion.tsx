import { ChevronDownIcon } from 'lucide-react'
import { ReactNode } from 'react'
import { clsx } from '../functions/clsx'

type AccordionProps = {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}

export function Accordion({ title, children, defaultOpen = false, className = '' }: AccordionProps) {
  return (
    <details open={defaultOpen} className={clsx('bg-base-200 text-base-content', className)}>
      <summary className="px-1 py-1 cursor-pointer select-none flex items-center gap-2 text-xs border-t border-base-300 bg-info/20">
        <ChevronDownIcon className="h-4 w-4 text-base-content/70" />
        {title}
      </summary>

      <div className="p-2 border-t border-base-300">{children}</div>
    </details>
  )
}
