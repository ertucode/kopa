export type LabelProps = {
  children: string
}

export function Label({ children }: LabelProps) {
  return (
    <span className="text-xs text-base-content/50 w-22 overflow-hidden overflow-ellipsis whitespace-nowrap">
      {children}
    </span>
  )
}
