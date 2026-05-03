import { HighlightLayer, HighlightBrushShape } from './types'

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }

export type HighlightSettingsState = {
  color: string
  opacity: number
  brushShape: HighlightBrushShape
  brushSize: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampHighlightOpacity(value: number): number {
  return clamp(Math.round(value * 100) / 100, 0.05, 1)
}

export function clampHighlightBrushSize(value: number): number {
  return clamp(Math.round(value), 1, 256)
}

export function normalizeHighlightPoints(
  points: Point[],
  brushSize: number
): { x: number; y: number; width: number; height: number; points: Point[] } {
  const radius = brushSize / 2
  const minX = Math.min(...points.map(point => point.x)) - radius
  const minY = Math.min(...points.map(point => point.y)) - radius
  const maxX = Math.max(...points.map(point => point.x)) + radius
  const maxY = Math.max(...points.map(point => point.y)) + radius

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
    points: points.map(point => ({
      x: point.x - minX,
      y: point.y - minY,
    })),
  }
}

export function createHighlightLayer(points: Point[], settings: HighlightSettingsState): HighlightLayer {
  const normalized = normalizeHighlightPoints(points, settings.brushSize)
  return {
    id: crypto.randomUUID(),
    type: 'highlight',
    name: 'Highlight',
    visible: true,
    opacity: settings.opacity,
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
    color: settings.color,
    brushSize: settings.brushSize,
    brushShape: settings.brushShape,
    points: normalized.points,
  }
}

export function getHighlightAbsolutePoints(layer: HighlightLayer): Point[] {
  return layer.points.map(point => ({
    x: layer.x + point.x,
    y: layer.y + point.y,
  }))
}

export function updateHighlightLayerPoints(layer: HighlightLayer, points: Point[]): HighlightLayer {
  const normalized = normalizeHighlightPoints(points, layer.brushSize)
  return {
    ...layer,
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
    points: normalized.points,
  }
}

export function updateHighlightLayerStyle(
  layer: HighlightLayer,
  changes: Partial<Pick<HighlightLayer, 'color' | 'opacity' | 'brushShape' | 'brushSize'>>
): HighlightLayer {
  const absolutePoints = getHighlightAbsolutePoints(layer)
  const nextLayer: HighlightLayer = {
    ...layer,
    ...changes,
  }

  if (changes.brushSize !== undefined) {
    return updateHighlightLayerPoints(nextLayer, absolutePoints)
  }

  return nextLayer
}

export function drawHighlightLayer(context: CanvasRenderingContext2D, layer: HighlightLayer) {
  if (!layer.points.length) return

  context.save()
  context.globalAlpha = layer.opacity
  context.fillStyle = layer.color
  context.strokeStyle = layer.color
  context.lineWidth = layer.brushSize
  context.lineCap = layer.brushShape === 'circle' ? 'round' : 'square'
  context.lineJoin = layer.brushShape === 'circle' ? 'round' : 'miter'

  if (layer.points.length === 1) {
    const point = layer.points[0]
    if (layer.brushShape === 'circle') {
      context.beginPath()
      context.arc(layer.x + point.x, layer.y + point.y, layer.brushSize / 2, 0, Math.PI * 2)
      context.fill()
    } else {
      const size = layer.brushSize
      context.fillRect(layer.x + point.x - size / 2, layer.y + point.y - size / 2, size, size)
    }
    context.restore()
    return
  }

  context.beginPath()
  context.moveTo(layer.x + layer.points[0].x, layer.y + layer.points[0].y)
  for (let index = 1; index < layer.points.length; index += 1) {
    const point = layer.points[index]
    context.lineTo(layer.x + point.x, layer.y + point.y)
  }
  context.stroke()
  context.restore()
}