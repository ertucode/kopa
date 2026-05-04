import { Label } from '@/lib/components/label'
import { SaveIcon } from 'lucide-react'
import { ReactNode } from 'react'

export type FormWithInlineApplyProps = {
  onSubmit: () => void
  label: string
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
      <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
        <Label className="w-16 text-clip">{label}</Label>
        <div className="flex w-full">
          {children}
          <button type="submit" className="btn btn-xs btn-outline w-8 rounded-none px-0" disabled={disabled}>
            <SaveIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  )
}
