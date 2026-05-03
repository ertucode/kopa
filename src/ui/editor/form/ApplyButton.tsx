export function ApplyButton({ disabled }: { disabled?: boolean }) {
  return (
    <div className="flex items-end">
      <button type="submit" className="btn btn-xs btn-info w-full" disabled={disabled}>
        Apply
      </button>
    </div>
  )
}
