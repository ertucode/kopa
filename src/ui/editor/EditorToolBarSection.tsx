import {
  MousePointer2Icon,
  Redo2Icon,
  ScanLineIcon,
  Undo2Icon,
} from 'lucide-react'
import { cn } from '@/lib/functions/clsx'
import { useToolStore } from './editorSimpleStores'

type EditorToolBarSectionProps = {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function EditorToolBarSection({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: EditorToolBarSectionProps) {
  const [tool, setTool] = useToolStore()

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        className={cn('btn btn-square btn-sm', tool === 'select' ? 'btn-info' : 'btn-ghost')}
        onClick={() => setTool('select')}
        title="Select and transform objects"
      >
        <MousePointer2Icon className="size-4" />
      </button>
      <button
        className={cn('btn btn-square btn-sm', tool === 'marquee' ? 'btn-info' : 'btn-ghost')}
        onClick={() => setTool('marquee')}
        title="Create a rectangular canvas selection"
      >
        <ScanLineIcon className="size-4" />
      </button>
      <button
        className={cn('btn btn-square btn-sm', tool === 'highlight' ? 'btn-info' : 'btn-ghost')}
        onClick={() => setTool('highlight')}
        title="Paint highlight objects"
      >
        <span className="text-xs font-semibold">H</span>
      </button>
      <button
        className={cn('btn btn-square btn-sm', tool === 'shape' ? 'btn-info' : 'btn-ghost')}
        onClick={() => setTool('shape')}
        title="Create shape objects"
      >
        <span className="text-xs font-semibold">S</span>
      </button>
      <button className="btn btn-square btn-sm btn-ghost" onClick={onUndo} disabled={!canUndo} title="Undo">
        <Undo2Icon className="size-4" />
      </button>
      <button className="btn btn-square btn-sm btn-ghost" onClick={onRedo} disabled={!canRedo} title="Redo">
        <Redo2Icon className="size-4" />
      </button>
    </div>
  )
}
