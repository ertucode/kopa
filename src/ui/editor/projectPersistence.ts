import {
  EditorProjectAssetContent,
  EditorProjectChange,
  EditorProjectDocument as PersistedEditorDocument,
  EditorProjectFile,
  EditorProjectLayer,
  EditorProjectOperation,
  EditorProjectSaveRequest,
  EditorProjectUiState,
} from '@common/EditorProject'
import { cloneDocument, documentsEqual } from '../utils/documentUtils'
import { EditorDocument, HistoryEntry } from './types'

type RuntimeHistoryState = {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

type SerializationResult = {
  request: EditorProjectSaveRequest
  currentIndex: number
}

type DeserializedProject = {
  documentState: EditorDocument | null
  history: RuntimeHistoryState
  ui: EditorProjectUiState
}

type AssetDescriptor = {
  assetId: string
  mimeType: string
  dataBase64: string
}

function parseDataUrl(dataUrl: string): { mimeType: string; dataBase64: string } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Unsupported image data format in editor project')
  }

  return {
    mimeType: match[1],
    dataBase64: match[2],
  }
}

function getFileExtensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/svg+xml') return 'svg'
  return 'bin'
}

async function hashString(value: string): Promise<string> {
  const buffer = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const nextItems = [...items]
  const [item] = nextItems.splice(fromIndex, 1)
  if (item === undefined) return items
  nextItems.splice(toIndex, 0, item)
  return nextItems
}

function buildTimeline(documentState: EditorDocument | null, history: RuntimeHistoryState) {
  if (!documentState) {
    return {
      states: [] as EditorDocument[],
      labels: [] as string[],
      currentIndex: 0,
    }
  }

  return {
    states: [...history.past.map(entry => cloneDocument(entry.document)), cloneDocument(documentState), ...history.future.map(entry => cloneDocument(entry.document))],
    labels: [...history.past.map(entry => entry.label), ...history.future.map(entry => entry.label)],
    currentIndex: history.past.length,
  }
}

async function buildAssetMap(states: EditorDocument[]) {
  const assetMap = new Map<string, AssetDescriptor>()
  const dataUrlToAssetId = new Map<string, string>()

  for (const state of states) {
    for (const layer of state.layers) {
      if (layer.type !== 'image') continue
      if (dataUrlToAssetId.has(layer.dataUrl)) continue
      const assetId = await hashString(layer.dataUrl)
      const { mimeType, dataBase64 } = parseDataUrl(layer.dataUrl)
      assetMap.set(assetId, { assetId, mimeType, dataBase64 })
      dataUrlToAssetId.set(layer.dataUrl, assetId)
    }
  }

  return { assetMap, dataUrlToAssetId }
}

function serializeDocument(documentState: EditorDocument, dataUrlToAssetId: Map<string, string>): PersistedEditorDocument {
  return {
    width: documentState.width,
    height: documentState.height,
    pasteWidth: documentState.pasteWidth,
    pasteHeight: documentState.pasteHeight,
    activeLayerId: documentState.activeLayerId,
    selection: documentState.selection ? { ...documentState.selection } : null,
    layers: documentState.layers.map(layer => {
      if (layer.type === 'highlight') {
        return {
          id: layer.id,
          type: 'highlight',
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          color: layer.color,
          brushSize: layer.brushSize,
          brushShape: layer.brushShape,
          points: layer.points.map(point => ({ ...point })),
        }
      }

      if (layer.type === 'shape') {
        return {
          id: layer.id,
          type: 'shape',
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          shape: layer.shape,
          fillColor: layer.fillColor,
          borderColor: layer.borderColor,
          borderRadius: layer.borderRadius,
        }
      }

      if (layer.type === 'text') {
        return {
          id: layer.id,
          type: 'text',
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          text: layer.text,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          fontWeight: layer.fontWeight,
          italic: layer.italic,
          underline: layer.underline,
          color: layer.color,
        }
      }

      const assetId = dataUrlToAssetId.get(layer.dataUrl)
      if (!assetId) {
        throw new Error(`Missing project asset for layer ${layer.name}`)
      }

      return {
        id: layer.id,
        type: 'image',
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        pixelWidth: layer.pixelWidth,
        pixelHeight: layer.pixelHeight,
        assetId,
      }
    }),
  }
}

function diffLayers(previousLayer: EditorProjectLayer, nextLayer: EditorProjectLayer) {
  const changes: Record<string, unknown> = {}

  if (previousLayer.type !== nextLayer.type) changes.type = nextLayer.type
  if (previousLayer.name !== nextLayer.name) changes.name = nextLayer.name
  if (previousLayer.visible !== nextLayer.visible) changes.visible = nextLayer.visible
  if (previousLayer.opacity !== nextLayer.opacity) changes.opacity = nextLayer.opacity
  if (previousLayer.x !== nextLayer.x) changes.x = nextLayer.x
  if (previousLayer.y !== nextLayer.y) changes.y = nextLayer.y
  if (previousLayer.width !== nextLayer.width) changes.width = nextLayer.width
  if (previousLayer.height !== nextLayer.height) changes.height = nextLayer.height
  if (previousLayer.type === 'image' && nextLayer.type === 'image') {
    if (previousLayer.pixelWidth !== nextLayer.pixelWidth) changes.pixelWidth = nextLayer.pixelWidth
    if (previousLayer.pixelHeight !== nextLayer.pixelHeight) changes.pixelHeight = nextLayer.pixelHeight
    if (previousLayer.assetId !== nextLayer.assetId) changes.assetId = nextLayer.assetId
  }
  if (previousLayer.type === 'highlight' && nextLayer.type === 'highlight') {
    if (previousLayer.color !== nextLayer.color) changes.color = nextLayer.color
    if (previousLayer.brushSize !== nextLayer.brushSize) changes.brushSize = nextLayer.brushSize
    if (previousLayer.brushShape !== nextLayer.brushShape) changes.brushShape = nextLayer.brushShape
    if (JSON.stringify(previousLayer.points) !== JSON.stringify(nextLayer.points)) {
      changes.points = nextLayer.points.map(point => ({ ...point }))
    }
  }
  if (previousLayer.type === 'shape' && nextLayer.type === 'shape') {
    if (previousLayer.shape !== nextLayer.shape) changes.shape = nextLayer.shape
    if (previousLayer.fillColor !== nextLayer.fillColor) changes.fillColor = nextLayer.fillColor
    if (previousLayer.borderColor !== nextLayer.borderColor) changes.borderColor = nextLayer.borderColor
    if (previousLayer.borderRadius !== nextLayer.borderRadius) changes.borderRadius = nextLayer.borderRadius
  }
  if (previousLayer.type === 'text' && nextLayer.type === 'text') {
    if (previousLayer.text !== nextLayer.text) changes.text = nextLayer.text
    if (previousLayer.fontFamily !== nextLayer.fontFamily) changes.fontFamily = nextLayer.fontFamily
    if (previousLayer.fontSize !== nextLayer.fontSize) changes.fontSize = nextLayer.fontSize
    if (previousLayer.fontWeight !== nextLayer.fontWeight) changes.fontWeight = nextLayer.fontWeight
    if (previousLayer.italic !== nextLayer.italic) changes.italic = nextLayer.italic
    if (previousLayer.underline !== nextLayer.underline) changes.underline = nextLayer.underline
    if (previousLayer.color !== nextLayer.color) changes.color = nextLayer.color
  }

  return changes as Extract<EditorProjectChange, { type: 'update-layer' }>['changes']
}

function diffDocuments(previousDocument: PersistedEditorDocument, nextDocument: PersistedEditorDocument, label: string): EditorProjectOperation {
  const changes: EditorProjectChange[] = []
  const documentPropChanges: Extract<EditorProjectChange, { type: 'set-document-props' }> = {
    type: 'set-document-props',
  }

  if (previousDocument.width !== nextDocument.width) documentPropChanges.width = nextDocument.width
  if (previousDocument.height !== nextDocument.height) documentPropChanges.height = nextDocument.height
  if (previousDocument.pasteWidth !== nextDocument.pasteWidth) documentPropChanges.pasteWidth = nextDocument.pasteWidth
  if (previousDocument.pasteHeight !== nextDocument.pasteHeight) documentPropChanges.pasteHeight = nextDocument.pasteHeight
  if (previousDocument.activeLayerId !== nextDocument.activeLayerId) documentPropChanges.activeLayerId = nextDocument.activeLayerId
  if (JSON.stringify(previousDocument.selection) !== JSON.stringify(nextDocument.selection)) {
    documentPropChanges.selection = nextDocument.selection
  }

  if (Object.keys(documentPropChanges).length > 1) {
    changes.push(documentPropChanges)
  }

  const previousIds = new Set(previousDocument.layers.map(layer => layer.id))
  const nextIds = new Set(nextDocument.layers.map(layer => layer.id))

  for (let index = previousDocument.layers.length - 1; index >= 0; index -= 1) {
    const layer = previousDocument.layers[index]
    if (!nextIds.has(layer.id)) {
      changes.push({ type: 'remove-layer', layerId: layer.id })
    }
  }

  for (let index = 0; index < nextDocument.layers.length; index += 1) {
    const layer = nextDocument.layers[index]
    if (!previousIds.has(layer.id)) {
      changes.push({ type: 'insert-layer', index, layer })
    }
  }

  const workingOrder = previousDocument.layers.filter(layer => nextIds.has(layer.id)).map(layer => layer.id)
  for (const change of changes) {
    if (change.type === 'insert-layer') {
      workingOrder.splice(change.index, 0, change.layer.id)
    }
  }

  for (let index = 0; index < nextDocument.layers.length; index += 1) {
    const targetId = nextDocument.layers[index].id
    const currentIndex = workingOrder.indexOf(targetId)
    if (currentIndex === -1 || currentIndex === index) continue
    workingOrder.splice(currentIndex, 1)
    workingOrder.splice(index, 0, targetId)
    changes.push({ type: 'move-layer', layerId: targetId, toIndex: index })
  }

  for (const nextLayer of nextDocument.layers) {
    const previousLayer = previousDocument.layers.find(layer => layer.id === nextLayer.id)
    if (!previousLayer) continue
    const layerChanges = diffLayers(previousLayer, nextLayer)
    if (Object.keys(layerChanges).length > 0) {
      changes.push({
        type: 'update-layer',
        layerId: nextLayer.id,
        changes: layerChanges,
      })
    }
  }

  return { label, changes }
}

function applyOperation(documentState: PersistedEditorDocument, operation: EditorProjectOperation): PersistedEditorDocument {
  let nextDocument = {
    ...documentState,
    layers: documentState.layers.map(layer =>
      layer.type === 'highlight'
        ? {
            ...layer,
            points: layer.points.map(point => ({ ...point })),
          }
        : { ...layer }
    ),
    selection: documentState.selection ? { ...documentState.selection } : null,
  }

  for (const change of operation.changes) {
    if (change.type === 'set-document-props') {
      nextDocument = {
        ...nextDocument,
        width: change.width ?? nextDocument.width,
        height: change.height ?? nextDocument.height,
        pasteWidth: change.pasteWidth !== undefined ? change.pasteWidth : nextDocument.pasteWidth,
        pasteHeight: change.pasteHeight !== undefined ? change.pasteHeight : nextDocument.pasteHeight,
        activeLayerId: change.activeLayerId !== undefined ? change.activeLayerId : nextDocument.activeLayerId,
        selection: change.selection !== undefined ? change.selection : nextDocument.selection,
      }
      continue
    }

    if (change.type === 'remove-layer') {
      nextDocument = {
        ...nextDocument,
        layers: nextDocument.layers.filter(layer => layer.id !== change.layerId),
      }
      continue
    }

    if (change.type === 'insert-layer') {
      const layers = [...nextDocument.layers]
      layers.splice(
        change.index,
        0,
        change.layer.type === 'highlight'
          ? {
              ...change.layer,
              points: change.layer.points.map(point => ({ ...point })),
            }
          : { ...change.layer }
      )
      nextDocument = {
        ...nextDocument,
        layers,
      }
      continue
    }

    if (change.type === 'move-layer') {
      const fromIndex = nextDocument.layers.findIndex(layer => layer.id === change.layerId)
      if (fromIndex === -1) continue
      nextDocument = {
        ...nextDocument,
        layers: moveArrayItem(nextDocument.layers, fromIndex, change.toIndex),
      }
      continue
    }

    nextDocument = {
      ...nextDocument,
      layers: nextDocument.layers.map<EditorProjectLayer>(layer => {
        if (layer.id !== change.layerId) return layer
        if (layer.type === 'highlight') {
          return {
            ...layer,
            ...change.changes,
            ...(change.changes.points ? { points: change.changes.points.map(point => ({ ...point })) } : {}),
          } as EditorProjectLayer
        }

        return {
          ...layer,
          ...change.changes,
        } as EditorProjectLayer
      }),
    }
  }

  return nextDocument
}

function deserializeDocument(documentState: PersistedEditorDocument, assetDataUrls: Map<string, string>): EditorDocument {
  return {
    width: documentState.width,
    height: documentState.height,
    pasteWidth: documentState.pasteWidth,
    pasteHeight: documentState.pasteHeight,
    activeLayerId: documentState.activeLayerId,
    selection: documentState.selection ? { ...documentState.selection } : null,
    layers: documentState.layers.map(layer => {
      if (layer.type === 'highlight') {
        return {
          id: layer.id,
          type: 'highlight',
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          color: layer.color,
          brushSize: layer.brushSize,
          brushShape: layer.brushShape,
          points: layer.points.map(point => ({ ...point })),
        }
      }

      if (layer.type === 'shape') {
        return {
          id: layer.id,
          type: 'shape',
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          shape: layer.shape,
          fillColor: layer.fillColor,
          borderColor: layer.borderColor,
          borderRadius: layer.borderRadius,
        }
      }

      if (layer.type === 'text') {
        return {
          id: layer.id,
          type: 'text',
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          text: layer.text,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          fontWeight: layer.fontWeight,
          italic: layer.italic,
          underline: layer.underline,
          color: layer.color,
        }
      }

      const dataUrl = assetDataUrls.get(layer.assetId)
      if (!dataUrl) {
        throw new Error(`Missing project image asset ${layer.assetId}`)
      }

      return {
        id: layer.id,
        type: 'image',
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        pixelWidth: layer.pixelWidth,
        pixelHeight: layer.pixelHeight,
        dataUrl,
      }
    }),
  }
}

export async function serializeProject(args: {
  name: string
  documentState: EditorDocument | null
  history: RuntimeHistoryState
  ui: EditorProjectUiState
}): Promise<SerializationResult> {
  const timeline = buildTimeline(args.documentState, args.history)
  const { assetMap, dataUrlToAssetId } = await buildAssetMap(timeline.states)
  const persistedStates = timeline.states.map(state => serializeDocument(state, dataUrlToAssetId))

  const project: EditorProjectFile = {
    version: 1,
    name: args.name,
    savedAt: new Date().toISOString(),
    assets: Object.fromEntries(
      Array.from(assetMap.values()).map(asset => [
        asset.assetId,
        {
          mimeType: asset.mimeType,
          relativePath: `assets/${asset.assetId}.${getFileExtensionFromMimeType(asset.mimeType)}`,
        },
      ])
    ),
    initialDocument: persistedStates[0] ?? (args.documentState ? serializeDocument(args.documentState, dataUrlToAssetId) : null),
    operations: [],
    currentIndex: timeline.currentIndex,
    ui: args.ui,
  }

  for (let index = 0; index < persistedStates.length - 1; index += 1) {
    const operation = diffDocuments(persistedStates[index], persistedStates[index + 1], timeline.labels[index])
    project.operations.push(operation)
  }

  return {
    request: {
      project,
      assetContents: Array.from(assetMap.values()).map<EditorProjectAssetContent>(asset => ({
        assetId: asset.assetId,
        mimeType: asset.mimeType,
        dataBase64: asset.dataBase64,
      })),
    },
    currentIndex: timeline.currentIndex,
  }
}

export async function deserializeProject(
  project: EditorProjectFile,
  loadAsset: (assetId: string) => Promise<string>
): Promise<DeserializedProject> {
  const assetIds = Object.keys(project.assets)
  const loadedAssets = await Promise.all(assetIds.map(async assetId => [assetId, await loadAsset(assetId)] as const))
  const assetDataUrls = new Map(loadedAssets)

  if (!project.initialDocument) {
    return {
      documentState: null,
      history: { past: [], future: [] },
      ui: project.ui,
    }
  }

  const persistedStates: PersistedEditorDocument[] = [project.initialDocument]
  let currentDocument = project.initialDocument
  for (const operation of project.operations) {
    currentDocument = applyOperation(currentDocument, operation)
    persistedStates.push(currentDocument)
  }

  const runtimeStates = persistedStates.map(state => deserializeDocument(state, assetDataUrls))
  const currentIndex = Math.min(project.currentIndex, runtimeStates.length - 1)
  const currentState = runtimeStates[currentIndex]
  const history: RuntimeHistoryState = {
    past: project.operations.slice(0, currentIndex).map((operation, index) => ({
      label: operation.label,
      document: cloneDocument(runtimeStates[index]),
    })),
    future: project.operations.slice(currentIndex).map((operation, index) => ({
      label: operation.label,
      document: cloneDocument(runtimeStates[currentIndex + index + 1]),
    })),
  }

  return {
    documentState: currentState ? cloneDocument(currentState) : null,
    history,
    ui: project.ui,
  }
}

export function hasProjectTimelineChanges(documentState: EditorDocument | null, history: RuntimeHistoryState): boolean {
  if (!documentState) return false
  if (history.past.length > 0 || history.future.length > 0) return true
  return !documentsEqual(documentState, null)
}
