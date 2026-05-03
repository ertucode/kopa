import { EditorDocument, ImageLayer, PixelSelection } from './types'

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

export async function cutSelectionFromLayer(layer: ImageLayer, selection: PixelSelection): Promise<{
  cutLayerDataUrl: string
  floatingDataUrl: string
}> {
  const baseCanvas = await renderLayerToCanvas(layer)
  const floatingCanvas = document.createElement('canvas')
  floatingCanvas.width = selection.width
  floatingCanvas.height = selection.height
  const floatingContext = floatingCanvas.getContext('2d')
  const baseContext = baseCanvas.getContext('2d')
  if (!floatingContext || !baseContext) {
    throw new Error('Could not create selection canvas')
  }

  floatingContext.drawImage(
    baseCanvas,
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    0,
    0,
    selection.width,
    selection.height
  )

  baseContext.clearRect(selection.x, selection.y, selection.width, selection.height)

  return {
    cutLayerDataUrl: canvasToDataUrl(baseCanvas),
    floatingDataUrl: canvasToDataUrl(floatingCanvas),
  }
}

export async function applyFloatingSelectionToLayer(args: {
  layer: ImageLayer
  cutLayerDataUrl: string
  floatingDataUrl: string
  destinationX: number
  destinationY: number
  width: number
  height: number
}): Promise<string> {
  const [baseImage, floatingImage] = await Promise.all([
    loadImageElement(args.cutLayerDataUrl),
    loadImageElement(args.floatingDataUrl),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = args.layer.pixelWidth
  canvas.height = args.layer.pixelHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create commit canvas')
  }

  context.drawImage(baseImage, 0, 0, args.layer.pixelWidth, args.layer.pixelHeight)
  context.drawImage(
    floatingImage,
    0,
    0,
    args.width,
    args.height,
    args.destinationX,
    args.destinationY,
    args.width,
    args.height
  )
  return canvasToDataUrl(canvas)
}
