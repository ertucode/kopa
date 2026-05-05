import { cn } from '@/lib/functions/clsx'
import { cloneDocument } from '../utils/documentUtils'
import { useDocumentStateStore, useHistoryStore } from './editorCoreStores'
import { useActiveLayerValue } from './editorDerivedValues'
import { EditorDocument } from './types'
import { ArrayUtils } from '@common/ArrayUtils'
import { Accordion } from '@/lib/components/accordion'

export function ObjectsListSection() {
  const [documentState, setDocumentState] = useDocumentStateStore()
  const [, setHistory] = useHistoryStore()
  const activeLayer = useActiveLayerValue()

  function pushHistory(label: string, previousDocument: EditorDocument, nextDocument: EditorDocument) {
    setDocumentState(nextDocument)
    setHistory(current => ({
      past: [...current.past, { label, document: cloneDocument(previousDocument) }],
      future: [],
    }))
  }

  function deleteLayer(layerId: string) {
    if (!documentState) return
    const layerIndex = documentState.layers.findIndex(layer => layer.id === layerId)
    if (layerIndex === -1) return

    const nextLayers = documentState.layers.filter(layer => layer.id !== layerId)
    const nextActiveLayerId =
      documentState.activeLayerId === layerId
        ? (nextLayers[Math.min(layerIndex, nextLayers.length - 1)]?.id ?? null)
        : documentState.activeLayerId

    const nextDocument: EditorDocument = {
      ...documentState,
      layers: nextLayers,
      activeLayerId: nextActiveLayerId,
      selection: documentState.selection,
    }

    pushHistory('Delete object', documentState, nextDocument)
  }

  function moveLayer(layerId: string, direction: 'up' | 'down') {
    if (!documentState) return
    const currentIndex = documentState.layers.findIndex(layer => layer.id === layerId)
    if (currentIndex === -1) return

    const targetIndex = direction === 'up' ? currentIndex + 1 : currentIndex - 1
    if (targetIndex < 0 || targetIndex >= documentState.layers.length) return

    const nextDocument: EditorDocument = {
      ...documentState,
      layers: ArrayUtils.moveArrayItem(documentState.layers, currentIndex, targetIndex),
    }

    pushHistory(direction === 'up' ? 'Move layer up' : 'Move layer down', documentState, nextDocument)
  }

  return (
    <section>
      <Accordion title="Objects" defaultOpen>
        <div className="bg-base-200/60 text-sm text-base-content/70">
          {documentState && documentState.layers.length > 0 ? (
            <div className="">
              {[...documentState.layers].reverse().map(layer => {
                const originalIndex = documentState.layers.findIndex(currentLayer => currentLayer.id === layer.id)
                const canMoveUp = originalIndex < documentState.layers.length - 1
                const canMoveDown = originalIndex > 0
                const isActive = activeLayer?.id === layer.id

                return (
                  <div
                    key={layer.id}
                    className={cn(
                      'flex items-center border px-2 py-2',
                      isActive ? 'border-info/60 bg-info/10' : 'border-base-content/10 bg-base-100/40'
                    )}
                  >
                    <button
                      className={cn(
                        'min-w-0 flex-1 text-left text-xs',
                        isActive ? 'text-base-content' : 'text-base-content/75'
                      )}
                      onClick={() =>
                        setDocumentState(current => (current ? { ...current, activeLayerId: layer.id } : current))
                      }
                    >
                      <div className="truncate font-medium">{layer.name}</div>
                      <div className="text-[8px] uppercase tracking-[0.14em] text-base-content/45">{layer.type}</div>
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => moveLayer(layer.id, 'up')}
                      disabled={!canMoveUp}
                      title="Move toward front"
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => moveLayer(layer.id, 'down')}
                      disabled={!canMoveDown}
                      title="Move toward back"
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-xs btn-ghost text-error"
                      onClick={() => deleteLayer(layer.id)}
                      title="Delete object"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-xs">No objects yet.</div>
          )}
        </div>
      </Accordion>
    </section>
  )
}
