import { Highlighter, MousePointer2Icon, ScanLineIcon, ShapesIcon, TypeIcon } from 'lucide-react'
import { cn } from '@/lib/functions/clsx'
import { useToolStore } from './editorSimpleStores'
import { EditorTool } from './types'
import { Tooltip } from '@/lib/components/Tooltip'

type EditorToolBarSectionProps = {}

export function EditorToolBarSection(_: EditorToolBarSectionProps) {
  return (
    <div className="flex flex-wrap">
      <Btn tool="select" title="Select and transform objects" Icon={MousePointer2Icon} />
      <Btn tool="marquee" title="Create a rectangular canvas selection" Icon={ScanLineIcon} />
      <Btn tool="highlight" title="Paint highlight objects" Icon={Highlighter} />
      <Btn tool="shape" title="Create shape objects" Icon={ShapesIcon} />
      <Btn tool="text" title="Create text objects" Icon={TypeIcon} />
    </div>
  )
}

function Btn({
  tool,
  title,
  Icon,
}: {
  tool: EditorTool
  title: string
  Icon: React.ComponentType<{ className: string }>
}) {
  const [currentTool, setTool] = useToolStore()
  return (
    <Tooltip placement="right" content={title}>
      <button
        className={cn('btn btn-square btn-sm rounded-none', tool === currentTool ? 'btn-info' : 'btn-ghost')}
        onClick={() => setTool(tool)}
      >
        <Icon className="size-4" />
      </button>
    </Tooltip>
  )
}
