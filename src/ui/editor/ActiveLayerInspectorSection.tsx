import { Accordion } from '@/lib/components/accordion'
import { CheckboxesWrapper, CheckboxField } from '@/lib/components/checkbox-field'
import { Input } from '@/lib/components/input'
import { InputColor } from '@/lib/components/input-color'
import { InputRange } from '@/lib/components/input-range'
import { LabeledInput } from '@/lib/components/labeled-input'
import { OneInputOneLine } from '@/lib/components/one-input-one-line'
import { Select } from '@/lib/components/select'
import { snapToStep } from '@common/TransformUtils'
import { parseRoundedMathExpression } from '../utils/customVariableUtils'
import {
  cloneDocument,
  documentsEqual,
  isHighlightLayer,
  isImageLayer,
  isShapeLayer,
  isTextLayer,
  updateLayer,
} from '../utils/documentUtils'
import { useDocumentStateStore, useHistoryStore } from './editorCoreStores'
import {
  useActiveHighlightValue,
  useActiveLayerExpressionVariablesValue,
  useActiveLayerValue,
  useActiveShapeValue,
  useActiveTextValue,
  useNormalizedMovementStepValue,
} from './editorDerivedValues'
import { pendingDraftSyncRef } from './editorDraftSyncState'
import { useLayerPositionDraftStore, useLayerSizeDraftStore, updateErrorMessageStoreValue } from './editorSimpleStores'
import { FormWithInlineApply } from './form/FormWithInlineApply'
import { clampHighlightBrushSize, clampHighlightOpacity, updateHighlightLayerStyle } from './highlightUtils'
import { clampShapeOpacity, updateShapeLayerStyle } from './shapeUtils'
import { clampTextFontSize, clampTextFontWeight, updateTextLayerStyle } from './textUtils'
import { useAvailableFontFamilies } from './useAvailableFontFamilies'
import { EditorDocument, HighlightBrushShape, HighlightLayer, ShapeLayer, ShapeType, TextLayer } from './types'

function formatPixels(value: number): string {
  return `${Math.round(value)}`
}

export function ActiveLayerInspectorSection() {
  const [documentState, setDocumentState] = useDocumentStateStore()
  const [, setHistory] = useHistoryStore()
  const activeLayer = useActiveLayerValue()
  const activeHighlight = useActiveHighlightValue()
  const activeShape = useActiveShapeValue()
  const activeText = useActiveTextValue()
  const activeLayerExpressionVariables = useActiveLayerExpressionVariablesValue()
  const normalizedMovementStep = useNormalizedMovementStepValue()
  const [layerPositionDraft, setLayerPositionDraft] = useLayerPositionDraftStore()
  const [layerSizeDraft, setLayerSizeDraft] = useLayerSizeDraftStore()
  const availableFonts = useAvailableFontFamilies(activeText?.fontFamily)

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
    if (isHighlightLayer(currentActiveLayer) || isTextLayer(currentActiveLayer)) return

    let width = Math.max(
      1,
      parseRoundedMathExpression(layerSizeDraft.width, activeLayerExpressionVariables) ?? Number.NaN
    )
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

  function applyActiveTextStyle(
    changes: Partial<
      Pick<TextLayer, 'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic' | 'underline' | 'color'>
    >
  ) {
    if (!activeText) return
    const nextDocument = updateLayer(currentDocument, activeText.id, layer => {
      if (!isTextLayer(layer)) return layer
      return updateTextLayerStyle(layer, changes)
    })
    if (documentsEqual(currentDocument, nextDocument)) return
    pushHistory('Update text', currentDocument, nextDocument)
  }

  return (
    <section>
      <Accordion title={`Active - ${currentActiveLayer.name}`} defaultOpen>
        <div className="bg-base-200/60 text-sm text-base-content/70">
          <div className="flex gap-2 text-xs">
            {isImageLayer(currentActiveLayer) && (
              <OneInputOneLine label="Raster size">
                <div className="text-xs h-7 flex items-center ">
                  {formatPixels(currentActiveLayer.pixelWidth)}x{formatPixels(currentActiveLayer.pixelHeight)}
                </div>
              </OneInputOneLine>
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
          {!isHighlightLayer(currentActiveLayer) &&
            !isTextLayer(currentActiveLayer) &&
            layerSizeDraft &&
            layerSizeDraft.layerId === currentActiveLayer.id && (
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
                <InputColor
                  value={activeHighlight.color}
                  onChange={value => applyActiveHighlightStyle({ color: value })}
                />
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
                <InputColor
                  value={activeShape.fillColor}
                  onChange={value => applyActiveShapeStyle({ fillColor: value })}
                />
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
          {activeText && (
            <>
              <OneInputOneLine label="Text">
                <textarea
                  className="textarea textarea-xs min-h-24 flex-1 rounded-none focus:outline-1 outline-offset-0"
                  value={activeText.text}
                  onChange={event => applyActiveTextStyle({ text: event.target.value })}
                />
              </OneInputOneLine>
              <OneInputOneLine label="Font">
                <Select
                  options={availableFonts.map(font => ({ label: font, value: font }))}
                  value={activeText.fontFamily}
                  onChange={value => applyActiveTextStyle({ fontFamily: value })}
                  searchable
                />
              </OneInputOneLine>
              <OneInputOneLine label="Size">
                <Input
                  type="number"
                  min={1}
                  max={512}
                  value={activeText.fontSize}
                  onChange={value =>
                    applyActiveTextStyle({ fontSize: clampTextFontSize(Number(value) || activeText.fontSize) })
                  }
                />
              </OneInputOneLine>
              <OneInputOneLine label="Weight">
                <Select
                  options={[
                    { label: 'Regular', value: '400' },
                    { label: 'Medium', value: '500' },
                    { label: 'Semibold', value: '600' },
                    { label: 'Bold', value: '700' },
                    { label: 'Black', value: '900' },
                  ]}
                  value={String(activeText.fontWeight)}
                  onChange={value => applyActiveTextStyle({ fontWeight: clampTextFontWeight(Number(value) || 400) })}
                />
              </OneInputOneLine>
              <OneInputOneLine label="Color">
                <InputColor value={activeText.color} onChange={value => applyActiveTextStyle({ color: value })} />
              </OneInputOneLine>
              <OneInputOneLine label="Style">
                <CheckboxesWrapper>
                  <CheckboxField
                    label="Italic"
                    checked={activeText.italic}
                    onChange={checked => applyActiveTextStyle({ italic: checked })}
                  />
                  <CheckboxField
                    label="Underline"
                    checked={activeText.underline}
                    onChange={checked => applyActiveTextStyle({ underline: checked })}
                  />
                </CheckboxesWrapper>
              </OneInputOneLine>
            </>
          )}
        </div>
      </Accordion>
    </section>
  )
}
