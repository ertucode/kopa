import { ShapeLayer, ShapeType } from './types'

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }

export type ShapeSettingsState = {
  shape: ShapeType
  fillColor: string
  borderColor: string
  borderRadius: number
  borderWidth?: number
  opacity: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeRect(start: Point, end: Point): Rect {
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

export function clampShapeOpacity(value: number): number {
  return clamp(Math.round(value * 100) / 100, 0.05, 1)
}

export function clampShapeBorderRadius(value: number, width: number, height: number): number {
  return clamp(Math.round(value), 0, Math.floor(Math.min(width, height) / 2))
}

export function normalizeCircleRect(start: Point, current: Point): Rect {
  const deltaX = current.x - start.x
  const deltaY = current.y - start.y
  const size = Math.max(1, Math.max(Math.abs(deltaX), Math.abs(deltaY)))

  return {
    x: deltaX >= 0 ? start.x : start.x - size,
    y: deltaY >= 0 ? start.y : start.y - size,
    width: size,
    height: size,
  }
}

export function createShapeLayer(rect: Rect, settings: ShapeSettingsState): ShapeLayer {
  return {
    id: crypto.randomUUID(),
    type: 'shape',
    name: settings.shape[0].toUpperCase() + settings.shape.slice(1),
    visible: true,
    opacity: settings.opacity,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    shape: settings.shape,
    fillColor: settings.fillColor,
    borderColor: settings.borderColor,
    borderWidth: settings.borderWidth,
    borderRadius: clampShapeBorderRadius(settings.borderRadius, rect.width, rect.height),
  }
}

export function getShapeRectFromDrag(settings: ShapeSettingsState, start: Point, current: Point): Rect {
  if (settings.shape === 'circle') {
    return normalizeCircleRect(start, current)
  }

  return normalizeRect(start, current)
}

export function updateShapeLayerRect(layer: ShapeLayer, rect: Rect): ShapeLayer {
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))

  return {
    ...layer,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width,
    height,
    borderRadius: clampShapeBorderRadius(layer.borderRadius, width, height),
  }
}

export function updateShapeLayerStyle(
  layer: ShapeLayer,
  changes: Partial<
    Pick<
      ShapeLayer,
      'shape' | 'fillColor' | 'borderColor' | 'borderRadius' | 'opacity' | 'width' | 'height' | 'borderWidth'
    >
  >
): ShapeLayer {
  const nextShape = changes.shape ?? layer.shape
  let width = Math.max(1, Math.round(changes.width ?? layer.width))
  let height = Math.max(1, Math.round(changes.height ?? layer.height))

  if (nextShape === 'circle') {
    const size = Math.max(width, height)
    width = size
    height = size
  }

  return {
    ...layer,
    ...changes,
    name: nextShape[0].toUpperCase() + nextShape.slice(1),
    shape: nextShape,
    width,
    height,
    borderRadius: clampShapeBorderRadius(changes.borderRadius ?? layer.borderRadius, width, height),
    borderWidth: changes.borderWidth ?? layer.borderWidth,
  }
}

function buildRoundedRectPath(context: CanvasRenderingContext2D, rect: Rect, radius: number) {
  context.beginPath()
  context.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
}

export function drawShapeLayer(context: CanvasRenderingContext2D, layer: ShapeLayer) {
  const rect = { x: layer.x, y: layer.y, width: layer.width, height: layer.height }

  context.save()
  context.globalAlpha = layer.opacity
  context.fillStyle = layer.fillColor
  context.strokeStyle = layer.borderColor
  context.lineWidth = layer.borderWidth ?? 2

  if (layer.shape === 'rectangle') {
    buildRoundedRectPath(context, rect, clampShapeBorderRadius(layer.borderRadius, layer.width, layer.height))
  } else {
    context.beginPath()
    context.ellipse(
      layer.x + layer.width / 2,
      layer.y + layer.height / 2,
      layer.width / 2,
      layer.height / 2,
      0,
      0,
      Math.PI * 2
    )
  }

  context.fill()
  context.stroke()
  context.restore()
}