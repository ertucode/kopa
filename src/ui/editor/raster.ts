import { EditorDocument, EditorLayer, HighlightLayer, ImageLayer, PixelSelection, ShapeLayer } from './types'

export async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  await image.decode()
  return image
}

export async function createLayerFromFile(file: File, document: EditorDocument): Promise<ImageLayer> {
  const dataUrl = await readFileAsDataUrl(file)
  const image = await loadImageElement(dataUrl)
  const width = document.pasteWidth === null ? image.naturalWidth : Math.max(1, Math.round(document.pasteWidth))
  const height = document.pasteHeight === null ? image.naturalHeight : Math.max(1, Math.round(document.pasteHeight))

  return {
    id: crypto.randomUUID(),
    type: 'image',
    name: file.name,
    visible: true,
    opacity: 1,
    x: Math.round((document.width - width) / 2),
    y: Math.round((document.height - height) / 2),
    width,
    height,
    pixelWidth: image.naturalWidth,
    pixelHeight: image.naturalHeight,
    dataUrl,
  }
}

function drawHighlightLayer(context: CanvasRenderingContext2D, layer: HighlightLayer) {
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

function drawShapeLayer(context: CanvasRenderingContext2D, layer: ShapeLayer) {
  context.save()
  context.globalAlpha = layer.opacity
  context.fillStyle = layer.fillColor
  context.strokeStyle = layer.borderColor
  context.lineWidth = 2

  if (layer.shape === 'rectangle') {
    context.beginPath()
    context.roundRect(layer.x, layer.y, layer.width, layer.height, layer.borderRadius)
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

async function renderLayerToCanvas(layer: ImageLayer): Promise<HTMLCanvasElement> {
  const image = await loadImageElement(layer.dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = layer.pixelWidth
  canvas.height = layer.pixelHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create layer canvas')
  }
  context.drawImage(image, 0, 0, layer.pixelWidth, layer.pixelHeight)
  return canvas
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

async function renderDocumentToCanvas(documentState: EditorDocument): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = documentState.width
  canvas.height = documentState.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create document canvas')
  }

  for (const layer of documentState.layers) {
    if (!layer.visible) continue
    if (layer.type === 'highlight') {
      drawHighlightLayer(context, layer)
      continue
    }
    if (layer.type === 'shape') {
      drawShapeLayer(context, layer)
      continue
    }
    const image = await loadImageElement(layer.dataUrl)
    context.save()
    context.globalAlpha = layer.opacity
    context.imageSmoothingEnabled = true
    context.drawImage(image, layer.x, layer.y, layer.width, layer.height)
    context.restore()
  }

  return canvas
}

function getSelectionIntersection(selection: PixelSelection, layer: ImageLayer): {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
} | null {
  const left = Math.max(selection.x, layer.x)
  const top = Math.max(selection.y, layer.y)
  const right = Math.min(selection.x + selection.width, layer.x + layer.width)
  const bottom = Math.min(selection.y + selection.height, layer.y + layer.height)

  if (right <= left || bottom <= top) return null

  const sourceX = Math.max(0, Math.round(((left - layer.x) / layer.width) * layer.pixelWidth))
  const sourceY = Math.max(0, Math.round(((top - layer.y) / layer.height) * layer.pixelHeight))
  const sourceRight = Math.min(layer.pixelWidth, Math.round(((right - layer.x) / layer.width) * layer.pixelWidth))
  const sourceBottom = Math.min(layer.pixelHeight, Math.round(((bottom - layer.y) / layer.height) * layer.pixelHeight))

  return {
    sourceX,
    sourceY,
    sourceWidth: Math.max(1, sourceRight - sourceX),
    sourceHeight: Math.max(1, sourceBottom - sourceY),
  }
}

export async function cutSelectionFromDocument(documentState: EditorDocument, selection: PixelSelection): Promise<{
  layers: EditorLayer[]
  floatingDataUrl: string
}> {
  const documentCanvas = await renderDocumentToCanvas(documentState)
  const floatingCanvas = document.createElement('canvas')
  floatingCanvas.width = selection.width
  floatingCanvas.height = selection.height
  const floatingContext = floatingCanvas.getContext('2d')
  if (!floatingContext) {
    throw new Error('Could not create selection canvas')
  }

  floatingContext.drawImage(
    documentCanvas,
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    0,
    0,
    selection.width,
    selection.height
  )

  const layers = await Promise.all(
    documentState.layers.map(async layer => {
      if (!layer.visible) return layer
      if (layer.type === 'highlight' || layer.type === 'shape') return layer
      const intersection = getSelectionIntersection(selection, layer)
      if (!intersection) return layer

      const layerCanvas = await renderLayerToCanvas(layer)
      const layerContext = layerCanvas.getContext('2d')
      if (!layerContext) {
        throw new Error('Could not create layer selection canvas')
      }

      layerContext.clearRect(
        intersection.sourceX,
        intersection.sourceY,
        intersection.sourceWidth,
        intersection.sourceHeight
      )

      return {
        ...layer,
        dataUrl: canvasToDataUrl(layerCanvas),
      }
    })
  )

  return {
    layers,
    floatingDataUrl: canvasToDataUrl(floatingCanvas),
  }
}
