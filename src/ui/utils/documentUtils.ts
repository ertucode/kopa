import { clamp, normalizeRect, Point, pointInRect, Rect } from '@common/TransformUtils'
import { EditorDocument, EditorLayer, HighlightLayer, PixelSelection, ShapeLayer, TextLayer } from '../editor/types'

export function cloneLayer<T extends EditorLayer>(layer: T): T {
  if (layer.type === 'highlight') {
    return {
      ...layer,
      points: layer.points.map(point => ({ ...point })),
    }
  }

  return { ...layer }
}

export function cloneDocument(documentState: EditorDocument): EditorDocument {
  return {
    ...documentState,
    layers: documentState.layers.map(layer => cloneLayer(layer)),
    selection: documentState.selection ? { ...documentState.selection } : null,
  }
}

export function documentsEqual(left: EditorDocument | null, right: EditorDocument | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function createDocument(width: number, height: number): EditorDocument {
  return {
    width,
    height,
    pasteWidth: null,
    pasteHeight: null,
    layers: [],
    activeLayerId: null,
    selection: null,
  }
}

export function updateLayer(
  documentState: EditorDocument,
  layerId: string,
  updater: (layer: EditorLayer) => EditorLayer
): EditorDocument {
  return {
    ...documentState,
    layers: documentState.layers.map(layer => (layer.id === layerId ? updater(layer) : layer)),
  }
}

export function getLayerRect(layer: EditorLayer): Rect {
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
}

export function hitLayer(layers: EditorLayer[], point: Point): EditorLayer | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    if (!layer.visible) continue
    if (pointInRect(point, getLayerRect(layer))) {
      return layer
    }
  }

  return null
}

export function isImageLayer(layer: EditorLayer): layer is Extract<EditorLayer, { type: 'image' }> {
  return layer.type === 'image'
}

export function isHighlightLayer(layer: EditorLayer): layer is HighlightLayer {
  return layer.type === 'highlight'
}

export function isShapeLayer(layer: EditorLayer): layer is ShapeLayer {
  return layer.type === 'shape'
}

export function isTextLayer(layer: EditorLayer): layer is TextLayer {
  return layer.type === 'text'
}

export function clampSelectionToDocument(selection: PixelSelection, documentState: EditorDocument): PixelSelection {
  const x = clamp(Math.round(selection.x), 0, documentState.width - 1)
  const y = clamp(Math.round(selection.y), 0, documentState.height - 1)
  const width = clamp(Math.round(selection.width), 1, documentState.width - x)
  const height = clamp(Math.round(selection.height), 1, documentState.height - y)

  return {
    x,
    y,
    width,
    height,
  }
}

export function selectionFromDrag(documentState: EditorDocument, start: Point, current: Point): PixelSelection {
  const normalized = normalizeRect(start, current)
  return clampSelectionToDocument(normalized, documentState)
}
