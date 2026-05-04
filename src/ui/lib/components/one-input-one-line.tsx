import { Label } from './label'

export type OneInputOneLineProps = {
  label: string
  children: React.ReactNode
}

export function OneInputOneLine({ label, children }: OneInputOneLineProps) {
  return (
    <div className="flex items-center gap-0">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
