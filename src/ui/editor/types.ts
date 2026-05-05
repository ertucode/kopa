export type EditorTool = 'select' | 'marquee' | 'highlight' | 'shape' | 'text'

export type LayerBase = {
  id: string
  name: string
  visible: boolean
  opacity: number
  x: number
  y: number
  width: number
  height: number
}

export type ImageLayer = LayerBase & {
  type: 'image'
  pixelWidth: number
  pixelHeight: number
  dataUrl: string
}

export type HighlightBrushShape = 'circle' | 'square'

export type HighlightPoint = {
  x: number
  y: number
}

export type HighlightLayer = LayerBase & {
  type: 'highlight'
  color: string
  brushSize: number
  brushShape: HighlightBrushShape
  points: HighlightPoint[]
}

export type ShapeType = 'rectangle' | 'circle' | 'ellipse'

export type ShapeLayer = LayerBase & {
  type: 'shape'
  shape: ShapeType
  fillColor: string
  borderColor: string
  borderRadius: number
  borderWidth?: number
}

export type TextLayer = LayerBase & {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  color: string
}

export type EditorLayer = ImageLayer | HighlightLayer | ShapeLayer | TextLayer

export type PixelSelection = {
  x: number
  y: number
  width: number
  height: number
}

export type EditorDocument = {
  width: number
  height: number
  background: string
  pasteWidth: number | null
  pasteHeight: number | null
  layers: EditorLayer[]
  activeLayerId: string | null
  selection: PixelSelection | null
}

export type HistoryEntry = {
  label: string
  document: EditorDocument
}

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export type NewDocumentPreset = {
  label: string
  width: number
  height: number
}
