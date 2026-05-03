export type EditorTool = 'select' | 'marquee'

export type ImageLayer = {
  id: string
  name: string
  visible: boolean
  opacity: number
  x: number
  y: number
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
  dataUrl: string
}

export type PixelSelection = {
  layerId: string
  x: number
  y: number
  width: number
  height: number
}

export type EditorDocument = {
  width: number
  height: number
  pasteWidth: number | null
  pasteHeight: number | null
  layers: ImageLayer[]
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
