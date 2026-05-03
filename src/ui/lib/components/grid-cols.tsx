import { Children } from 'react'

export function GridCols({ children }: { children: React.ReactNode }) {
  const count = Children.count(children)

  const wrapperClass = `grid grid-cols-[${Array(count - 1)
    .fill('1fr')
    .join('_')}_auto] gap-2 items-center`

  return <div className={wrapperClass}>{children}</div>
}
