export type CheckboxFieldProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-base-content/70">
      <input
        type="checkbox"
        className="checkbox checkbox-xs rounded-none"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

export function CheckboxesWrapper({ children }: { children: React.ReactNode }) {
  return <div className="flex h-7 flex-1 items-center gap-3 text-xs">{children}</div>
}
