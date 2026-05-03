import React from 'react'

export function PanelForm({
  onSubmit,
  header,
  children,
}: {
  onSubmit: () => void
  header: string
  children: React.ReactNode
}) {
  const count = React.Children.count(children)

  const wrapperClass = `grid grid-cols-[${Array(count - 1)
    .fill('1fr')
    .join('_')}_auto] gap-2`

  return (
    <form
      className="space-y-2"
      onSubmit={event => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">{header}</div>
      <div className={wrapperClass}>{children}</div>
    </form>
  )
}
