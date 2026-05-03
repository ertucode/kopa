import { GridCols } from '@/lib/components/grid-cols'
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
  return (
    <form
      className="space-y-2"
      onSubmit={event => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">{header}</div>
      <GridCols>{children}</GridCols>
    </form>
  )
}
