import { clamp, Point } from '@common/TransformUtils'
import { TextLayer } from './types'

export type TextSettingsState = {
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  color: string
}

const measureCanvas = document.createElement('canvas')
const measureContext = measureCanvas.getContext('2d')

export const DEFAULT_FONT_FAMILY = 'Arial'

export const FALLBACK_FONT_FAMILIES = [
  DEFAULT_FONT_FAMILY,
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Trebuchet MS',
  'Courier New',
  'Menlo',
  'Monaco',
  'system-ui',
]

function getTextLayerName(text: string) {
  const firstLine = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0)

  if (!firstLine) return 'Text'
  return firstLine.slice(0, 24)
}

export function clampTextFontSize(value: number) {
  return clamp(Math.round(value), 1, 512)
}

export function clampTextFontWeight(value: number) {
  return clamp(Math.round(value), 100, 900)
}

function quoteFontFamily(fontFamily: string) {
  if (/^[a-z0-9-]+$/i.test(fontFamily)) return fontFamily
  return `"${fontFamily.replace(/"/g, '\\"')}"`
}

export function buildCanvasFont(layer: Pick<TextLayer, 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic'>) {
  return `${layer.italic ? 'italic ' : ''}${layer.fontWeight} ${layer.fontSize}px ${quoteFontFamily(layer.fontFamily)}`
}

export function measureTextLayerBounds(layer: Pick<TextLayer, 'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic'>) {
  const lines = layer.text.length > 0 ? layer.text.split('\n') : ['']
  const context = measureContext
  if (!context) {
    const fallbackLineHeight = Math.max(1, Math.ceil(layer.fontSize * 1.2))
    return {
      width: Math.max(1, Math.ceil(layer.fontSize)),
      height: Math.max(1, fallbackLineHeight * lines.length),
      lineHeight: fallbackLineHeight,
    }
  }

  context.font = buildCanvasFont(layer)
  context.textBaseline = 'top'

  let width = 1
  let ascent = layer.fontSize
  let descent = Math.ceil(layer.fontSize * 0.2)

  for (const line of lines) {
    const metrics = context.measureText(line || ' ')
    width = Math.max(width, Math.ceil(metrics.width))
    ascent = Math.max(ascent, Math.ceil(metrics.actualBoundingBoxAscent || layer.fontSize))
    descent = Math.max(descent, Math.ceil(metrics.actualBoundingBoxDescent || layer.fontSize * 0.2))
  }

  const lineHeight = Math.max(1, Math.ceil(Math.max(layer.fontSize * 1.2, ascent + descent)))
  return {
    width,
    height: Math.max(1, lineHeight * lines.length),
    lineHeight,
  }
}

export function createTextLayer(pointer: Point, settings: TextSettingsState): TextLayer {
  const text = settings.text.trim().length > 0 ? settings.text : 'Text'
  const bounds = measureTextLayerBounds({
    text,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    fontWeight: settings.fontWeight,
    italic: settings.italic,
  })

  return {
    id: crypto.randomUUID(),
    type: 'text',
    name: getTextLayerName(text),
    visible: true,
    opacity: 1,
    x: Math.round(pointer.x),
    y: Math.round(pointer.y),
    width: bounds.width,
    height: bounds.height,
    text,
    fontFamily: settings.fontFamily,
    fontSize: clampTextFontSize(settings.fontSize),
    fontWeight: clampTextFontWeight(settings.fontWeight),
    italic: settings.italic,
    underline: settings.underline,
    color: settings.color,
  }
}

export function updateTextLayerStyle(
  layer: TextLayer,
  changes: Partial<Pick<TextLayer, 'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic' | 'underline' | 'color'>>
): TextLayer {
  const text = changes.text !== undefined ? changes.text : layer.text
  const nextLayer: TextLayer = {
    ...layer,
    ...changes,
    text,
    name: getTextLayerName(text),
    fontSize: clampTextFontSize(changes.fontSize ?? layer.fontSize),
    fontWeight: clampTextFontWeight(changes.fontWeight ?? layer.fontWeight),
  }
  const bounds = measureTextLayerBounds(nextLayer)

  return {
    ...nextLayer,
    width: bounds.width,
    height: bounds.height,
  }
}

export function drawTextLayer(context: CanvasRenderingContext2D, layer: TextLayer) {
  const lines = layer.text.split('\n')
  const { lineHeight } = measureTextLayerBounds(layer)

  context.save()
  context.globalAlpha = layer.opacity
  context.fillStyle = layer.color
  context.font = buildCanvasFont(layer)
  context.textBaseline = 'top'

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const x = layer.x
    const y = layer.y + lineHeight * index
    context.fillText(line, x, y)

    if (layer.underline) {
      const metrics = context.measureText(line || ' ')
      const underlineY = y + layer.fontSize + Math.max(1, Math.round(layer.fontSize * 0.08))
      context.beginPath()
      context.lineWidth = Math.max(1, Math.round(layer.fontSize * 0.06))
      context.strokeStyle = layer.color
      context.moveTo(x, underlineY)
      context.lineTo(x + Math.max(1, metrics.width), underlineY)
      context.stroke()
    }
  }

  context.restore()
}
