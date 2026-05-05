import type { PointerEvent } from 'react'
import { Point, pointInRect, Rect } from '@common/TransformUtils'
import { ImageLayer, ResizeHandle } from './types'

export function getHandles(layer: ImageLayer): Array<{ handle: ResizeHandle; rect: Rect }> {
  const size = 12
  const half = size / 2
  const points: Record<ResizeHandle, Point> = {
    n: { x: layer.x + layer.width / 2, y: layer.y },
    ne: { x: layer.x + layer.width, y: layer.y },
    e: { x: layer.x + layer.width, y: layer.y + layer.height / 2 },
    se: { x: layer.x + layer.width, y: layer.y + layer.height },
    s: { x: layer.x + layer.width / 2, y: layer.y + layer.height },
    sw: { x: layer.x, y: layer.y + layer.height },
    w: { x: layer.x, y: layer.y + layer.height / 2 },
    nw: { x: layer.x, y: layer.y },
  }

  return (Object.entries(points) as [ResizeHandle, Point][]).map(([handle, point]) => ({
    handle,
    rect: { x: point.x - half, y: point.y - half, width: size, height: size },
  }))
}

export function findHandle(layer: ImageLayer, point: Point): ResizeHandle | null {
  for (const item of getHandles(layer)) {
    if (pointInRect(point, item.rect)) {
      return item.handle
    }
  }

  return null
}

export function getPointerOnCanvas(event: PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  }
}
