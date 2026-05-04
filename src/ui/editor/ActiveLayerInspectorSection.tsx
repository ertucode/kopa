import { Accordion } from '@/lib/components/accordion'
import { Input } from '@/lib/components/input'
import { InputColor } from '@/lib/components/input-color'
import { InputRange } from '@/lib/components/input-range'
import { LabeledInput } from '@/lib/components/labeled-input'
import { OneInputOneLine } from '@/lib/components/one-input-one-line'
import { Select } from '@/lib/components/select'
import { snapToStep } from '@common/TransformUtils'
import { parseRoundedMathExpression } from '../utils/customVariableUtils'
import { useDocumentStateStore, useHistoryStore } from './editorCoreStores'
import {
  useActiveHighlightValue,
  useActiveLayerExpressionVariablesValue,
  useActiveLayerValue,
  useActiveShapeValue,
  useNormalizedMovementStepValue,
} from './editorDerivedValues'
import { pendingDraftSyncRef } from './editorDraftSyncState'
import { useLayerPositionDraftStore, useLayerSizeDraftStore, updateErrorMessageStoreValue } from './editorSimpleStores'
import { FormWithInlineApply } from './form/FormWithInlineApply'
import {
  clampHighlightBrushSize,
  clampHighlightOpacity,
  updateHighlightLayerStyle,
} from './highlightUtils'
import {
  clampShapeOpacity,
  updateShapeLayerStyle,
} from './shapeUtils'
import { EditorDocument, EditorLayer, HighlightBrushShape, HighlightLayer, ShapeLayer, ShapeType } from './types'

function cloneLayer<T extends EditorLayer>(layer: T): T {
  if (layer.type === 'highlight') {
    return {
      ...layer,
      points: layer.points.map(point => ({ ...point })),
    }
  }

  return { ...layer }
}

function cloneDocument(documentState: EditorDocument): EditorDocument {
  return {
    ...documentState,
    layers: documentState.layers.map(layer => cloneLayer(layer)),
    selection: documentState.selection ? { ...documentState.selection } : null,
  }
}

function documentsEqual(left: EditorDocument, right: EditorDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function updateLayer(
  documentState: EditorDocument,
  layerId: string,
  updater: (layer: EditorLayer) => EditorLayer
): EditorDocument {
  return {
    ...documentState,
    layers: documentState.layers.map(layer => (layer.id === layerId ? updater(layer) : layer)),
  }
}

function isImageLayer(layer: EditorLayer): layer is Extract<EditorLayer, { type: 'image' }> {
  return layer.type === 'image'
}

function isHighlightLayer(layer: EditorLayer): layer is HighlightLayer {
  return layer.type === 'highlight'
}

function isShapeLayer(layer: EditorLayer): layer is ShapeLayer {
  return layer.type === 'shape'
}

function formatPixels(value: number): string {
  return `${Math.round(value)}`
}

export function ActiveLayerInspectorSection() {
  const [documentState, setDocumentState] = useDocumentStateStore()
  const [, setHistory] = useHistoryStore()
  const activeLayer = useActiveLayerValue()
  const activeHighlight = useActiveHighlightValue()
  const activeShape = useActiveShapeValue()
  const activeLayerExpressionVariables = useActiveLayerExpressionVariablesValue()
  const normalizedMovementStep = useNormalizedMovementStepValue()
  const [layerPositionDraft, setLayerPositionDraft] = useLayerPositionDraftStore()
  const [layerSizeDraft, setLayerSizeDraft] = useLayerSizeDraftStore()

  if (!activeLayer || !documentState) return null

  const currentActiveLayer = activeLayer
  const currentDocument = documentState

  function pushHistory(label: string, previousDocument: EditorDocument, nextDocument: EditorDocument) {
    setDocumentState(nextDocument)
    setHistory(current => ({
      past: [...current.past, { label, document: cloneDocument(previousDocument) }],
      future: [],
    }))
  }

  const isInspectorPositionUnchanged =
    !!layerPositionDraft &&
    layerPositionDraft.layerId === currentActiveLayer.id &&
    snapToStep(
      parseRoundedMathExpression(layerPositionDraft.x, activeLayerExpressionVariables) ?? Number.NaN,
      normalizedMovementStep
    ) === Math.round(currentActiveLayer.x) &&
    snapToStep(
      parseRoundedMathExpression(layerPositionDraft.y, activeLayerExpressionVariables) ?? Number.NaN,
      normalizedMovementStep
    ) === Math.round(currentActiveLayer.y)

  const isInspectorSizeUnchanged =
    !!layerSizeDraft &&
    layerSizeDraft.layerId === currentActiveLayer.id &&
    parseRoundedMathExpression(layerSizeDraft.width, activeLayerExpressionVariables) ===
      Math.round(currentActiveLayer.width) &&
    parseRoundedMathExpression(layerSizeDraft.height, activeLayerExpressionVariables) ===
      Math.round(currentActiveLayer.height)

  function applyInspectorPosition() {
    if (!layerPositionDraft || layerPositionDraft.layerId !== currentActiveLayer.id) return

    const parsedX = parseRoundedMathExpression(layerPositionDraft.x, activeLayerExpressionVariables)
    const parsedY = parseRoundedMathExpression(layerPositionDraft.y, activeLayerExpressionVariables)
    const x = snapToStep(parsedX ?? Number.NaN, normalizedMovementStep)
    const y = snapToStep(parsedY ?? Number.NaN, normalizedMovementStep)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      updateErrorMessageStoreValue('Position coordinates must be valid numbers or simple math expressions')
      return
    }

    const nextDocument = updateLayer(currentDocument, currentActiveLayer.id, layer => ({
      ...layer,
      x,
      y,
    }))

    pendingDraftSyncRef.current.layerPosition = layerPositionDraft
    pushHistory('Set exact position', currentDocument, nextDocument)
  }

  function applyInspectorSize() {
    if (!layerSizeDraft || layerSizeDraft.layerId !== currentActiveLayer.id) return
    if (isHighlightLayer(currentActiveLayer)) return

    let width = Math.max(1, parseRoundedMathExpression(layerSizeDraft.width, activeLayerExpressionVariables) ?? Number.NaN)
    let height = Math.max(
      1,
      parseRoundedMathExpression(layerSizeDraft.height, activeLayerExpressionVariables) ?? Number.NaN
    )
    if (
      isShapeLayer(currentActiveLayer) &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      currentActiveLayer.shape === 'circle'
    ) {
      const size = Math.max(width, height)
      width = size
      height = size
    }
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      updateErrorMessageStoreValue('Width and height must be valid numbers or simple math expressions')
      return
    }

    const nextDocument = updateLayer(currentDocument, currentActiveLayer.id, layer => ({
      ...layer,
      width,
      height,
    }))

    pendingDraftSyncRef.current.layerSize = layerSizeDraft
    pushHistory('Set exact size', currentDocument, nextDocument)
  }

  function applyActiveHighlightStyle(
    changes: Partial<Pick<HighlightLayer, 'color' | 'opacity' | 'brushShape' | 'brushSize'>>
  ) {
    if (!activeHighlight) return
    const nextDocument = updateLayer(currentDocument, activeHighlight.id, layer => {
      if (!isHighlightLayer(layer)) return layer
      return updateHighlightLayerStyle(layer, changes)
    })
    if (documentsEqual(currentDocument, nextDocument)) return
    pushHistory('Update highlight', currentDocument, nextDocument)
  }

  function applyActiveShapeStyle(
    changes: Partial<
      Pick<
        ShapeLayer,
        'shape' | 'fillColor' | 'borderColor' | 'borderRadius' | 'opacity' | 'width' | 'height' | 'borderWidth'
      >
    >
  ) {
    if (!activeShape) return
    const nextDocument = updateLayer(currentDocument, activeShape.id, layer => {
      if (!isShapeLayer(layer)) return layer
      return updateShapeLayerStyle(layer, changes)
    })
    if (documentsEqual(currentDocument, nextDocument)) return
    pushHistory('Update shape', currentDocument, nextDocument)
  }

  return (
    <section>
      <Accordion title={`Active - ${currentActiveLayer.name}`} defaultOpen>
        <div className="space-y-3 bg-base-200/60 text-sm text-base-content/70">
          <div className="flex gap-2 text-xs">
            {isImageLayer(currentActiveLayer) && (
              <div>
                Raster size: {formatPixels(currentActiveLayer.pixelWidth)}x{formatPixels(currentActiveLayer.pixelHeight)}
              </div>
            )}
          </div>
          {layerPositionDraft && layerPositionDraft.layerId === currentActiveLayer.id && (
            <FormWithInlineApply
              label="Position"
              onSubmit={applyInspectorPosition}
              disabled={isInspectorPositionUnchanged}
            >
              <LabeledInput
                label="X"
                value={layerPositionDraft.x}
                onChange={event => setLayerPositionDraft(current => (current ? { ...current, x: event } : current))}
              />
              <LabeledInput
                label="Y"
                value={layerPositionDraft.y}
                onChange={event => setLayerPositionDraft(current => (current ? { ...current, y: event } : current))}
              />
            </FormWithInlineApply>
          )}
          {!isHighlightLayer(currentActiveLayer) && layerSizeDraft && layerSizeDraft.layerId === currentActiveLayer.id && (
            <FormWithInlineApply label="Exact Size" onSubmit={applyInspectorSize} disabled={isInspectorSizeUnchanged}>
              <LabeledInput
                label="W"
                value={layerSizeDraft.width}
                onChange={event => setLayerSizeDraft(current => (current ? { ...current, width: event } : current))}
              />
              <LabeledInput
                label="H"
                value={layerSizeDraft.height}
                onChange={event => setLayerSizeDraft(current => (current ? { ...current, height: event } : current))}
              />
            </FormWithInlineApply>
          )}
          {activeHighlight && (
            <>
              <OneInputOneLine label="Color">
                <InputColor value={activeHighlight.color} onChange={value => applyActiveHighlightStyle({ color: value })} />
              </OneInputOneLine>
              <OneInputOneLine label="Opacity">
                <InputRange
                  value={activeHighlight.opacity}
                  onChange={value => applyActiveHighlightStyle({ opacity: clampHighlightOpacity(Number(value)) })}
                />
              </OneInputOneLine>
              <OneInputOneLine label="Brush">
                <Select
                  options={[
                    { label: 'Circle', value: 'circle' },
                    { label: 'Square', value: 'square' },
                  ]}
                  value={activeHighlight.brushShape}
                  onChange={value => applyActiveHighlightStyle({ brushShape: value as HighlightBrushShape })}
                />
              </OneInputOneLine>
              <OneInputOneLine label="Size">
                <Input
                  type="number"
                  min={4}
                  max={256}
                  className="input input-xs"
                  value={activeHighlight.brushSize}
                  onChange={value =>
                    applyActiveHighlightStyle({
                      brushSize: clampHighlightBrushSize(Number(value) || activeHighlight.brushSize),
                    })
                  }
                />
              </OneInputOneLine>
            </>
          )}
          {activeShape && (
            <>
              <OneInputOneLine label="Type">
                <Select
                  options={[
                    { label: 'Rectangle', value: 'rectangle' },
                    { label: 'Circle', value: 'circle' },
                    { label: 'Ellipse', value: 'ellipse' },
                  ]}
                  value={activeShape.shape}
                  onChange={value => applyActiveShapeStyle({ shape: value as ShapeType })}
                />
              </OneInputOneLine>
              <OneInputOneLine label="Fill">
                <InputColor value={activeShape.fillColor} onChange={value => applyActiveShapeStyle({ fillColor: value })} />
              </OneInputOneLine>
              <OneInputOneLine label="Border">
                <InputColor
                  value={activeShape.borderColor}
                  onChange={value => applyActiveShapeStyle({ borderColor: value })}
                />
              </OneInputOneLine>
              <OneInputOneLine label="Radius">
                <Input
                  type="number"
                  min={0}
                  className="input input-xs"
                  value={activeShape.borderRadius}
                  disabled={activeShape.shape !== 'rectangle'}
                  onChange={value =>
                    applyActiveShapeStyle({ borderRadius: Math.max(0, Math.round(Number(value) || 0)) })
                  }
                />
              </OneInputOneLine>
              <OneInputOneLine label="Border Width">
                <Input
                  type="number"
                  min={0}
                  className="input input-xs"
                  value={activeShape.borderWidth}
                  disabled={activeShape.shape !== 'rectangle'}
                  onChange={value =>
                    applyActiveShapeStyle({ borderWidth: Math.max(0, Math.round(Number(value) || 0)) })
                  }
                />
              </OneInputOneLine>
              <OneInputOneLine label="Opacity">
                <InputRange
                  value={activeShape.opacity}
                  onChange={value => applyActiveShapeStyle({ opacity: clampShapeOpacity(Number(value)) })}
                />
              </OneInputOneLine>
            </>
          )}
        </div>
      </Accordion>
    </section>
  )
}
