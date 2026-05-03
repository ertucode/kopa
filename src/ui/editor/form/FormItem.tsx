export function FormItem({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="form-control gap-1 flex">
      <span className="label text-[11px]">{label}</span>
      <input className="input input-xs" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  )
}
