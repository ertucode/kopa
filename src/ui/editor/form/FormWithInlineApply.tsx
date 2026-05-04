import { Label } from '@/lib/components/label'
import { cn } from '@/lib/functions/clsx'
import { SaveIcon } from 'lucide-react'
import React, { ButtonHTMLAttributes, ReactNode } from 'react'

export type FormWithInlineApplyProps = {
  onSubmit: () => void
  label: string | undefined
  children: ReactNode
  disabled?: boolean
}

export function FormWithInlineApply({ onSubmit, label, children, disabled }: FormWithInlineApplyProps) {
  return (
    <form
      className="space-y-2"
      onSubmit={event => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="grid grid-cols-[auto_1fr] items-center">
        {label && <Label className="text-clip">{label}</Label>}
        <div className="flex w-full">
          {children}
          <InlineButton type="submit" disabled={disabled} Icon={SaveIcon} />
        </div>
      </div>
    </form>
  )
}

export function InlineButton({
  className,
  Icon,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button className={cn('btn btn-xs btn-outline w-8 rounded-none px-0 border-base-content/20', className)} {...props}>
      {<Icon className="h-4 w-4" />}
    </button>
  )
}
