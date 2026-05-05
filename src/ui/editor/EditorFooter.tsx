import { useHistoryStoreValue } from './editorCoreStores'
import { useToolStoreValue } from './editorSimpleStores'

function getToolLabel(tool: ReturnType<typeof useToolStoreValue>) {
  if (tool === 'select') return 'Select'
  if (tool === 'marquee') return 'Marquee'
  if (tool === 'highlight') return 'Highlight'
  if (tool === 'shape') return 'Shape'
  return 'Text'
}

export function EditorFooter() {
  const tool = useToolStoreValue()
  const history = useHistoryStoreValue()

  return (
    <div className="flex items-center justify-between border-t border-base-content/10 px-4 py-2 text-xs text-base-content/55">
      <div>
        Tool: <span className="text-base-content/80">{getToolLabel(tool)}</span>
      </div>
      <div>
        {history.past.length} / {history.future.length + history.past.length}
      </div>
    </div>
  )
}
