import { clamp, Point, snapToStep } from '@common/TransformUtils'
import { parseRoundedMathExpression, resolveCustomVariables } from '../utils/customVariableUtils'
import {
  clampSelectionToDocument,
  cloneDocument,
  documentsEqual,
  getLayerRect,
  isHighlightLayer,
  isShapeLayer,
  updateLayer,
} from '../utils/documentUtils'
import { getDocumentStateStoreValue, updateDocumentStateStoreValue, updateHistoryStoreValue } from './editorCoreStores'
import {
  createHighlightLayer,
  getHighlightAbsolutePoints,
  updateHighlightLayerPoints,
} from './highlightUtils'
import { cutSelectionFromDocument } from './raster'
import {
  getCustomVariablesStoreValue,
  getHighlightSettingsStoreValue,
  getInteractionStoreValue,
  getMovementStepStoreValue,
  getSelectionPreviewStoreValue,
  getShapeSettingsStoreValue,
  updateInteractionStoreValue,
  updateSelectionPreviewStoreValue,
} from './editorSimpleStores'
import { createShapeLayer, getShapeRectFromDrag, updateShapeLayerRect } from './shapeUtils'
import { EditorLayer, ImageLayer, PixelSelection, ResizeHandle } from './types'

function getNormalizedMovementStepValue(): number {
  const documentState = getDocumentStateStoreValue()
  const resolvedVariables = resolveCustomVariables(getCustomVariablesStoreValue(), {
    canvasWidth: documentState?.width ?? 0,
    canvasHeight: documentState?.height ?? 0,
  }).variables

  return Math.max(1, parseRoundedMathExpression(getMovementStepStoreValue(), resolvedVariables) ?? 1)
}

export function finalizeInteraction(label: string) {
  const interaction = getInteractionStoreValue()
  const documentState = getDocumentStateStoreValue()
  if (!interaction || !documentState) return

  if (documentsEqual(interaction.initialDocument, documentState)) {
    updateInteractionStoreValue(null)
    return
  }

  updateHistoryStoreValue(current => ({
    past: [...current.past, { label, document: cloneDocument(interaction.initialDocument) }],
    future: [],
  }))
  updateInteractionStoreValue(null)
}

export function cancelInteraction() {
  const interaction = getInteractionStoreValue()
  if (!interaction) return

  updateDocumentStateStoreValue(cloneDocument(interaction.initialDocument))
  updateInteractionStoreValue(null)
  updateSelectionPreviewStoreValue(null)
}

export async function startSelectionMove(selection: PixelSelection, pointer: Point) {
  const documentState = getDocumentStateStoreValue()
  if (!documentState) return

  const currentDocument = cloneDocument(documentState)
  const draft = await cutSelectionFromDocument(currentDocument, selection)

  updateDocumentStateStoreValue({
    ...currentDocument,
    layers: draft.layers,
    selection,
  })
  updateSelectionPreviewStoreValue({
    floatingDataUrl: draft.floatingDataUrl,
    selection,
  })
  updateInteractionStoreValue({
    type: 'moving-selection',
    initialDocument: cloneDocument(documentState),
    selectionStart: selection,
    pointerStart: pointer,
    floatingDataUrl: draft.floatingDataUrl,
  })
}

export function beginLayerMove(layer: EditorLayer, pointer: Point) {
  const documentState = getDocumentStateStoreValue()
  if (!documentState) return

  updateDocumentStateStoreValue({ ...documentState, activeLayerId: layer.id, selection: null })
  updateInteractionStoreValue({
    type: 'moving-layer',
    initialDocument: cloneDocument(documentState),
    layerId: layer.id,
    pointerStart: pointer,
    layerStart: getLayerRect(layer),
  })
}

export function beginResize(layer: ImageLayer, pointer: Point, handle: ResizeHandle) {
  const documentState = getDocumentStateStoreValue()
  if (!documentState) return

  updateDocumentStateStoreValue({ ...documentState, activeLayerId: layer.id, selection: null })
  updateInteractionStoreValue({
    type: 'resizing-layer',
    initialDocument: cloneDocument(documentState),
    layerId: layer.id,
    handle,
    pointerStart: pointer,
    layerStart: getLayerRect(layer),
    aspectRatio: layer.width / layer.height,
  })
}

export function beginSelectionCreation(start: Point, activeLayerId: string | null) {
  const documentState = getDocumentStateStoreValue()
  if (!documentState) return

  updateDocumentStateStoreValue({ ...documentState, activeLayerId, selection: null })
  updateInteractionStoreValue({
    type: 'creating-selection',
    initialDocument: cloneDocument(documentState),
    start,
  })
}

export function beginHighlightCreation(pointer: Point) {
  const documentState = getDocumentStateStoreValue()
  if (!documentState) return

  const layer = createHighlightLayer([pointer], getHighlightSettingsStoreValue())
  updateDocumentStateStoreValue({
    ...documentState,
    layers: [...documentState.layers, layer],
    activeLayerId: layer.id,
    selection: null,
  })
  updateInteractionStoreValue({
    type: 'creating-highlight',
    initialDocument: cloneDocument(documentState),
    layerId: layer.id,
    start: pointer,
    axisLock: null,
  })
}

export function beginShapeCreation(pointer: Point) {
  const documentState = getDocumentStateStoreValue()
  if (!documentState) return

  const layer = createShapeLayer({ x: pointer.x, y: pointer.y, width: 1, height: 1 }, getShapeSettingsStoreValue())
  updateDocumentStateStoreValue({
    ...documentState,
    layers: [...documentState.layers, layer],
    activeLayerId: layer.id,
    selection: null,
  })
  updateInteractionStoreValue({
    type: 'creating-shape',
    initialDocument: cloneDocument(documentState),
    layerId: layer.id,
    start: pointer,
  })
}

export function updateLayerMove(pointer: Point) {
  const interaction = getInteractionStoreValue()
  const documentState = getDocumentStateStoreValue()
  if (!interaction || interaction.type !== 'moving-layer' || !documentState) return

  const normalizedMovementStep = getNormalizedMovementStepValue()
  const deltaX = Math.round(pointer.x - interaction.pointerStart.x)
  const deltaY = Math.round(pointer.y - interaction.pointerStart.y)

  updateDocumentStateStoreValue(
    updateLayer(documentState, interaction.layerId, layer => ({
      ...layer,
      x: snapToStep(interaction.layerStart.x + deltaX, normalizedMovementStep),
      y: snapToStep(interaction.layerStart.y + deltaY, normalizedMovementStep),
    }))
  )
}

export function updateLayerResize(pointer: Point, keepAspectRatio: boolean) {
  const interaction = getInteractionStoreValue()
  const documentState = getDocumentStateStoreValue()
  if (!interaction || interaction.type !== 'resizing-layer' || !documentState) return

  const deltaX = pointer.x - interaction.pointerStart.x
  const deltaY = pointer.y - interaction.pointerStart.y
  let nextRect = { ...interaction.layerStart }

  if (interaction.handle.includes('e')) {
    nextRect.width = Math.max(1, interaction.layerStart.width + deltaX)
  }
  if (interaction.handle.includes('s')) {
    nextRect.height = Math.max(1, interaction.layerStart.height + deltaY)
  }
  if (interaction.handle.includes('w')) {
    nextRect.x = interaction.layerStart.x + deltaX
    nextRect.width = Math.max(1, interaction.layerStart.width - deltaX)
  }
  if (interaction.handle.includes('n')) {
    nextRect.y = interaction.layerStart.y + deltaY
    nextRect.height = Math.max(1, interaction.layerStart.height - deltaY)
  }

  if (keepAspectRatio) {
    const ratio = interaction.aspectRatio
    const basedOnWidth = Math.abs(deltaX) >= Math.abs(deltaY)
    if (basedOnWidth) {
      nextRect.height = Math.max(1, nextRect.width / ratio)
      if (interaction.handle.includes('n')) {
        nextRect.y = interaction.layerStart.y + interaction.layerStart.height - nextRect.height
      }
    } else {
      nextRect.width = Math.max(1, nextRect.height * ratio)
      if (interaction.handle.includes('w')) {
        nextRect.x = interaction.layerStart.x + interaction.layerStart.width - nextRect.width
      }
    }
  }

  updateDocumentStateStoreValue(
    updateLayer(documentState, interaction.layerId, layer => ({
      ...layer,
      x: Math.round(nextRect.x),
      y: Math.round(nextRect.y),
      width: Math.max(1, Math.round(nextRect.width)),
      height: Math.max(1, Math.round(nextRect.height)),
    }))
  )
}

export function updateSelectionCreation(pointer: Point) {
  const interaction = getInteractionStoreValue()
  const documentState = getDocumentStateStoreValue()
  if (!interaction || interaction.type !== 'creating-selection' || !documentState) return

  const selection = clampSelectionToDocument(
    {
      x: Math.min(interaction.start.x, pointer.x),
      y: Math.min(interaction.start.y, pointer.y),
      width: Math.abs(pointer.x - interaction.start.x),
      height: Math.abs(pointer.y - interaction.start.y),
    },
    documentState
  )

  updateDocumentStateStoreValue({ ...documentState, selection })
}

export function updateHighlightCreation(pointer: Point, constrainAxis: boolean) {
  const interaction = getInteractionStoreValue()
  const documentState = getDocumentStateStoreValue()
  if (!interaction || interaction.type !== 'creating-highlight' || !documentState) return

  const layer = documentState.layers.find(currentLayer => currentLayer.id === interaction.layerId)
  if (!layer || !isHighlightLayer(layer)) return

  const absolutePoints = getHighlightAbsolutePoints(layer)
  const lastPoint = absolutePoints[absolutePoints.length - 1]

  let constrainedPointer = pointer
  let nextAxisLock = interaction.axisLock

  if (!constrainAxis) {
    nextAxisLock = null
  } else if (lastPoint) {
    if (interaction.axisLock === null) {
      const deltaX = Math.abs(pointer.x - lastPoint.x)
      const deltaY = Math.abs(pointer.y - lastPoint.y)
      nextAxisLock = deltaX >= deltaY ? 'x' : 'y'
    }

    if (nextAxisLock === 'x') {
      constrainedPointer = { x: pointer.x, y: lastPoint.y }
    } else {
      constrainedPointer = { x: lastPoint.x, y: pointer.y }
    }
  }

  if (
    lastPoint &&
    Math.round(lastPoint.x) === Math.round(constrainedPointer.x) &&
    Math.round(lastPoint.y) === Math.round(constrainedPointer.y)
  ) {
    return
  }

  updateDocumentStateStoreValue(
    updateLayer(documentState, interaction.layerId, currentLayer => {
      if (!isHighlightLayer(currentLayer)) return currentLayer
      return updateHighlightLayerPoints(currentLayer, [...getHighlightAbsolutePoints(currentLayer), constrainedPointer])
    })
  )

  if (interaction.axisLock !== nextAxisLock) {
    updateInteractionStoreValue({ ...interaction, axisLock: nextAxisLock })
  }
}

export function updateShapeCreation(pointer: Point) {
  const interaction = getInteractionStoreValue()
  const documentState = getDocumentStateStoreValue()
  if (!interaction || interaction.type !== 'creating-shape' || !documentState) return

  const rect = getShapeRectFromDrag(getShapeSettingsStoreValue(), interaction.start, pointer)
  updateDocumentStateStoreValue(
    updateLayer(documentState, interaction.layerId, layer => {
      if (!isShapeLayer(layer)) return layer
      return updateShapeLayerRect(layer, rect)
    })
  )
}

export function updateSelectionMove(pointer: Point) {
  const interaction = getInteractionStoreValue()
  const documentState = getDocumentStateStoreValue()
  const selectionPreview = getSelectionPreviewStoreValue()
  if (!interaction || interaction.type !== 'moving-selection' || !documentState || !selectionPreview) return

  const deltaDocumentX = Math.round(pointer.x - interaction.pointerStart.x)
  const deltaDocumentY = Math.round(pointer.y - interaction.pointerStart.y)
  const maxX = documentState.width - interaction.selectionStart.width
  const maxY = documentState.height - interaction.selectionStart.height

  const selection = {
    ...interaction.selectionStart,
    x: clamp(interaction.selectionStart.x + deltaDocumentX, 0, Math.max(0, maxX)),
    y: clamp(interaction.selectionStart.y + deltaDocumentY, 0, Math.max(0, maxY)),
  }

  updateDocumentStateStoreValue({ ...documentState, selection })
  updateSelectionPreviewStoreValue({
    ...selectionPreview,
    selection,
  })
}

export function finishSelectionMove() {
  const interaction = getInteractionStoreValue()
  const documentState = getDocumentStateStoreValue()
  if (!interaction || interaction.type !== 'moving-selection' || !documentState || !documentState.selection) return

  if (
    documentState.selection.x === interaction.selectionStart.x &&
    documentState.selection.y === interaction.selectionStart.y &&
    documentState.selection.width === interaction.selectionStart.width &&
    documentState.selection.height === interaction.selectionStart.height
  ) {
    updateDocumentStateStoreValue(cloneDocument(interaction.initialDocument))
    updateSelectionPreviewStoreValue(null)
    updateInteractionStoreValue(null)
    return
  }

  const nextLayer: ImageLayer = {
    id: crypto.randomUUID(),
    type: 'image',
    name: 'Selection',
    visible: true,
    opacity: 1,
    x: documentState.selection.x,
    y: documentState.selection.y,
    width: documentState.selection.width,
    height: documentState.selection.height,
    pixelWidth: interaction.selectionStart.width,
    pixelHeight: interaction.selectionStart.height,
    dataUrl: interaction.floatingDataUrl,
  }

  updateDocumentStateStoreValue({
    ...documentState,
    layers: [...documentState.layers, nextLayer],
    activeLayerId: nextLayer.id,
    selection: documentState.selection,
  })
  updateSelectionPreviewStoreValue(null)
  updateHistoryStoreValue(current => ({
    past: [...current.past, { label: 'Move selection', document: cloneDocument(interaction.initialDocument) }],
    future: [],
  }))
  updateInteractionStoreValue(null)
}
