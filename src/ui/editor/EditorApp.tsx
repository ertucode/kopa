import { useEffect, useMemo, useRef, useState } from 'react'
import useMeasure from 'react-use-measure'
import {
  FolderOpenIcon,
  ImagePlusIcon,
  MousePointer2Icon,
  Redo2Icon,
  SaveIcon,
  ScanLineIcon,
  Undo2Icon,
} from 'lucide-react'
import { Button } from '@/lib/components/button'
import { Dialog } from '@/lib/components/dialog'
import { ContextMenu, ContextMenuList, useContextMenu } from '@/lib/components/context-menu'
import { useShortcuts } from '@/lib/hooks/useShortcuts'
import { cn } from '@/lib/functions/clsx'
import { getWindowElectron, windowArgs } from '@/getWindowElectron'
import { RecentEditorProject } from '@common/EditorProject'
import { applyFloatingSelectionToLayer, createLayerFromFile, cutSelectionFromLayer, loadImageElement } from './raster'
import { deserializeProject, serializeProject } from './projectPersistence'
import { EditorDocument, EditorTool, HistoryEntry, ImageLayer, NewDocumentPreset, PixelSelection, ResizeHandle } from './types'

const DOCUMENT_PRESETS: NewDocumentPreset[] = [
  { label: 'Avatar', width: 512, height: 512 },
  { label: 'Square', width: 1024, height: 1024 },
  { label: 'Full HD', width: 1920, height: 1080 },
  { label: 'Poster', width: 2048, height: 2048 },
]

type InteractionState =
  | {
      type: 'moving-layer'
      initialDocument: EditorDocument
      layerId: string
      pointerStart: Point
      layerStart: Rect
    }
  | {
      type: 'resizing-layer'
      initialDocument: EditorDocument
      layerId: string
      handle: ResizeHandle
      pointerStart: Point
      layerStart: Rect
      aspectRatio: number
    }
  | {
      type: 'creating-selection'
      initialDocument: EditorDocument
      layerId: string
      start: Point
    }
  | {
      type: 'moving-selection'
      initialDocument: EditorDocument
      layerId: string
      selectionStart: PixelSelection
      pointerStart: Point
      cutLayerDataUrl: string
      floatingDataUrl: string
    }
  | null

type Point = { x: number; y: number }
type Rect = { x: number; y: number; width: number; height: number }

type SizeDialogState = {
  layerId: string
  width: string
  height: string
  keepAspectRatio: boolean
}

type PositionDialogState = {
  layerId: string
  x: string
  y: string
}

type CanvasDraftState = {
  width: string
  height: string
}

type PasteSizeDraftState = {
  width: string
  height: string
}

type LayerPositionDraftState = {
  layerId: string
  x: string
  y: string
}

type LayerSizeDraftState = {
  layerId: string
  width: string
  height: string
}

type ProjectNameDraftState = {
  value: string
}

type SelectionPreview = {
  layerId: string
  floatingDataUrl: string
  layerDataUrl: string
  selection: PixelSelection
}

type EditorSessionState = {
  tool: EditorTool
  canvasDraft: CanvasDraftState
  movementStep: string
}

const DEFAULT_EDITOR_SESSION: EditorSessionState = {
  tool: 'select',
  canvasDraft: { width: '1024', height: '1024' },
  movementStep: '1',
}

function cloneDocument(documentState: EditorDocument): EditorDocument {
  return {
    ...documentState,
    layers: documentState.layers.map(layer => ({ ...layer })),
    selection: documentState.selection ? { ...documentState.selection } : null,
  }
}

function documentsEqual(left: EditorDocument, right: EditorDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function createDocument(width: number, height: number): EditorDocument {
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

function getActiveLayer(documentState: EditorDocument | null): ImageLayer | null {
  if (!documentState?.activeLayerId) return null
  return documentState.layers.find(layer => layer.id === documentState.activeLayerId) ?? null
}

function updateLayer(documentState: EditorDocument, layerId: string, updater: (layer: ImageLayer) => ImageLayer): EditorDocument {
  return {
    ...documentState,
    layers: documentState.layers.map(layer => (layer.id === layerId ? updater(layer) : layer)),
  }
}

function replaceActiveLayerData(documentState: EditorDocument, layerId: string, dataUrl: string): EditorDocument {
  return updateLayer(documentState, layerId, layer => ({ ...layer, dataUrl }))
}

function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getLayerRect(layer: ImageLayer): Rect {
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
}

function getSelectionDocumentRect(layer: ImageLayer, selection: PixelSelection): Rect {
  return {
    x: layer.x + (selection.x / layer.pixelWidth) * layer.width,
    y: layer.y + (selection.y / layer.pixelHeight) * layer.height,
    width: (selection.width / layer.pixelWidth) * layer.width,
    height: (selection.height / layer.pixelHeight) * layer.height,
  }
}

function getHandles(layer: ImageLayer): Array<{ handle: ResizeHandle; rect: Rect }> {
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

function hitLayer(layers: ImageLayer[], point: Point): ImageLayer | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    if (!layer.visible) continue
    if (pointInRect(point, getLayerRect(layer))) {
      return layer
    }
  }
  return null
}

function getPointerOnCanvas(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  }
}

function documentPointToLayerPixel(point: Point, layer: ImageLayer): Point {
  return {
    x: ((point.x - layer.x) / layer.width) * layer.pixelWidth,
    y: ((point.y - layer.y) / layer.height) * layer.pixelHeight,
  }
}

function clampSelectionToLayer(selection: PixelSelection, layer: ImageLayer): PixelSelection {
  const x = clamp(Math.round(selection.x), 0, layer.pixelWidth - 1)
  const y = clamp(Math.round(selection.y), 0, layer.pixelHeight - 1)
  const width = clamp(Math.round(selection.width), 1, layer.pixelWidth - x)
  const height = clamp(Math.round(selection.height), 1, layer.pixelHeight - y)
  return {
    layerId: selection.layerId,
    x,
    y,
    width,
    height,
  }
}

function selectionFromDrag(layer: ImageLayer, start: Point, current: Point): PixelSelection {
  const normalized = normalizeRect(documentPointToLayerPixel(start, layer), documentPointToLayerPixel(current, layer))
  return clampSelectionToLayer(
    {
      layerId: layer.id,
      x: normalized.x,
      y: normalized.y,
      width: normalized.width,
      height: normalized.height,
    },
    layer
  )
}

function formatPixels(value: number): string {
  return `${Math.round(value)} px`
}

function getNormalizedMovementStep(value: string): number {
  const step = Math.max(1, Math.round(Number(value)))
  return Number.isFinite(step) ? step : 1
}

function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const nextItems = [...items]
  const [item] = nextItems.splice(fromIndex, 1)
  if (item === undefined) return items
  nextItems.splice(toIndex, 0, item)
  return nextItems
}

export function EditorApp() {
  const [documentState, setDocumentState] = useState<EditorDocument | null>(null)
  const [history, setHistory] = useState<{ past: HistoryEntry[]; future: HistoryEntry[] }>({ past: [], future: [] })
  const [tool, setTool] = useState<EditorTool>(DEFAULT_EDITOR_SESSION.tool)
  const [interaction, setInteraction] = useState<InteractionState>(null)
  const [selectionPreview, setSelectionPreview] = useState<SelectionPreview | null>(null)
  const [sizeDialog, setSizeDialog] = useState<SizeDialogState | null>(null)
  const [positionDialog, setPositionDialog] = useState<PositionDialogState | null>(null)
  const [canvasDraft, setCanvasDraft] = useState<CanvasDraftState>(DEFAULT_EDITOR_SESSION.canvasDraft)
  const [pasteSizeDraft, setPasteSizeDraft] = useState<PasteSizeDraftState>({ width: '', height: '' })
  const [movementStep, setMovementStep] = useState(DEFAULT_EDITOR_SESSION.movementStep)
  const [movementStepDraft, setMovementStepDraft] = useState(DEFAULT_EDITOR_SESSION.movementStep)
  const [layerPositionDraft, setLayerPositionDraft] = useState<LayerPositionDraftState | null>(null)
  const [layerSizeDraft, setLayerSizeDraft] = useState<LayerSizeDraftState | null>(null)
  const [projectNameDraft, setProjectNameDraft] = useState<ProjectNameDraftState>({ value: 'Untitled Project' })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isProjectSaving, setIsProjectSaving] = useState(false)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('Untitled Project')
  const [recentProjects, setRecentProjects] = useState<RecentEditorProject[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [viewportRef, viewportBounds] = useMeasure()
  const inputRef = useRef<HTMLInputElement>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const documentStateRef = useRef<EditorDocument | null>(null)
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>())
  const isHydratingProjectRef = useRef(true)
  const autosaveTimeoutRef = useRef<number | null>(null)
  const [imageRevision, setImageRevision] = useState(0)

  const activeLayer = useMemo(() => getActiveLayer(documentState), [documentState])

  function applyProjectState(args: {
    nextProjectPath: string | null
    nextProjectName: string
    nextDocumentState: EditorDocument | null
    nextHistory: { past: HistoryEntry[]; future: HistoryEntry[] }
    nextTool: EditorTool
    nextCanvasDraft: CanvasDraftState
    nextMovementStep: string
  }) {
    isHydratingProjectRef.current = true
    setProjectPath(args.nextProjectPath)
    setProjectName(args.nextProjectName)
    setProjectNameDraft({ value: args.nextProjectName })
    setDocumentState(args.nextDocumentState)
    setHistory(args.nextHistory)
    setTool(args.nextTool)
    setCanvasDraft(args.nextCanvasDraft)
    setMovementStep(args.nextMovementStep)
    setMovementStepDraft(args.nextMovementStep)
    setInteraction(null)
    setSelectionPreview(null)
    setLayerPositionDraft(null)
    setLayerSizeDraft(null)
    setPasteSizeDraft({
      width: args.nextDocumentState?.pasteWidth === null ? '' : String(args.nextDocumentState?.pasteWidth ?? ''),
      height: args.nextDocumentState?.pasteHeight === null ? '' : String(args.nextDocumentState?.pasteHeight ?? ''),
    })
    setHasUnsavedChanges(false)
  }

  async function refreshRecentProjects() {
    try {
      setRecentProjects(await getWindowElectron().getRecentEditorProjects())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load recent projects')
    }
  }

  function confirmDiscardUnsavedChanges() {
    if (!hasUnsavedChanges) return true
    return window.confirm('You have unsaved editor changes. Continue and discard them?')
  }

  async function openProjectFromPath(nextProjectPath: string, providedName?: string) {
    try {
      const response = await getWindowElectron().loadEditorProject({ projectPath: nextProjectPath })
      const loadedProject = await deserializeProject(response.project, assetId =>
        getWindowElectron().loadEditorProjectAsset({ projectPath: response.projectPath, assetId })
      )

      imageCacheRef.current.clear()
      setImageRevision(revision => revision + 1)
      applyProjectState({
        nextProjectPath: response.projectPath,
        nextProjectName: providedName ?? response.project.name,
        nextDocumentState: loadedProject.documentState,
        nextHistory: loadedProject.history,
        nextTool: loadedProject.ui.tool,
        nextCanvasDraft: loadedProject.ui.canvasDraft,
        nextMovementStep: loadedProject.ui.movementStep,
      })
      await refreshRecentProjects()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open editor project')
    }
  }

  async function saveProjectToPath(nextProjectPath: string) {
    setIsProjectSaving(true)

    try {
      const serializedProject = await serializeProject({
        name: projectName,
        documentState,
        history,
        ui: {
          tool,
          canvasDraft,
          movementStep,
        },
      })

      await getWindowElectron().saveEditorProject({
        projectPath: nextProjectPath,
        request: serializedProject.request,
      })

      setProjectPath(nextProjectPath)
      setProjectName(serializedProject.request.project.name)
      setHasUnsavedChanges(false)
      await refreshRecentProjects()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save editor project')
    } finally {
      setIsProjectSaving(false)
    }
  }

  async function handleSaveProjectAs() {
    setIsProjectSaving(true)

    try {
      const serializedProject = await serializeProject({
        name: projectName,
        documentState,
        history,
        ui: {
          tool,
          canvasDraft,
          movementStep,
        },
      })

      const response = await getWindowElectron().saveEditorProjectAs({
        request: serializedProject.request,
        defaultName: projectName,
      })

      if (!response.canceled && response.projectPath) {
        setProjectPath(response.projectPath)
        setProjectName(serializedProject.request.project.name)
        setHasUnsavedChanges(false)
        await refreshRecentProjects()
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save editor project')
    } finally {
      setIsProjectSaving(false)
    }
  }

  async function handleSaveProject() {
    if (projectPath) {
      await saveProjectToPath(projectPath)
      return
    }

    await handleSaveProjectAs()
  }

  async function handleOpenProject() {
    if (!confirmDiscardUnsavedChanges()) return

    try {
      const response = await getWindowElectron().openEditorProject()
      if (response.canceled || !response.projectPath || !response.project) return
      const nextProjectPath = response.projectPath
      const loadedProject = await deserializeProject(response.project, assetId =>
        getWindowElectron().loadEditorProjectAsset({ projectPath: nextProjectPath, assetId })
      )

      imageCacheRef.current.clear()
      setImageRevision(revision => revision + 1)
      applyProjectState({
        nextProjectPath,
        nextProjectName: response.project.name,
        nextDocumentState: loadedProject.documentState,
        nextHistory: loadedProject.history,
        nextTool: loadedProject.ui.tool,
        nextCanvasDraft: loadedProject.ui.canvasDraft,
        nextMovementStep: loadedProject.ui.movementStep,
      })
      await refreshRecentProjects()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open editor project')
    }
  }

  async function handleOpenRecentProject(nextProjectPath: string) {
    if (!confirmDiscardUnsavedChanges()) return
    await openProjectFromPath(nextProjectPath)
  }

  function startNewProject(width: number, height: number) {
    if (!confirmDiscardUnsavedChanges()) return
    applyProjectState({
      nextProjectPath: null,
      nextProjectName: 'Untitled Project',
      nextDocumentState: createDocument(width, height),
      nextHistory: { past: [], future: [] },
      nextTool: DEFAULT_EDITOR_SESSION.tool,
      nextCanvasDraft: { width: String(width), height: String(height) },
      nextMovementStep: DEFAULT_EDITOR_SESSION.movementStep,
    })
    setHasUnsavedChanges(true)
  }

  function applyProjectName() {
    const nextProjectName = projectNameDraft.value.trim()
    if (!nextProjectName) {
      setErrorMessage('Project name cannot be empty')
      return
    }

    if (nextProjectName === projectName) return
    setProjectName(nextProjectName)
    setHasUnsavedChanges(true)
  }

  function applyMovementStep() {
    setMovementStep(String(getNormalizedMovementStep(movementStepDraft)))
  }

  useEffect(() => {
    documentStateRef.current = documentState
  }, [documentState])

  useEffect(() => {
    void refreshRecentProjects()

    if (windowArgs.initialPath) {
      void openProjectFromPath(windowArgs.initialPath)
    }
  }, [])

  useEffect(() => {
    if (!activeLayer) {
      setLayerPositionDraft(null)
      setLayerSizeDraft(null)
      return
    }

    setLayerPositionDraft(current => {
      if (
        current?.layerId === activeLayer.id &&
        current.x === String(Math.round(activeLayer.x)) &&
        current.y === String(Math.round(activeLayer.y))
      ) {
        return current
      }

      return {
        layerId: activeLayer.id,
        x: String(Math.round(activeLayer.x)),
        y: String(Math.round(activeLayer.y)),
      }
    })

    setLayerSizeDraft(current => {
      if (
        current?.layerId === activeLayer.id &&
        current.width === String(Math.round(activeLayer.width)) &&
        current.height === String(Math.round(activeLayer.height))
      ) {
        return current
      }

      return {
        layerId: activeLayer.id,
        width: String(Math.round(activeLayer.width)),
        height: String(Math.round(activeLayer.height)),
      }
    })
  }, [activeLayer])

  useEffect(() => {
    if (!documentState) return
    setPasteSizeDraft({
      width: documentState.pasteWidth === null ? '' : String(documentState.pasteWidth),
      height: documentState.pasteHeight === null ? '' : String(documentState.pasteHeight),
    })
  }, [documentState?.pasteHeight, documentState?.pasteWidth])

  useEffect(() => {
    if (isHydratingProjectRef.current) {
      isHydratingProjectRef.current = false
      return
    }

    setHasUnsavedChanges(true)

    if (interaction || !projectPath) return

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current)
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      void saveProjectToPath(projectPath)
    }, 700)

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current)
      }
    }
  }, [canvasDraft, documentState, history, interaction, movementStep, projectName, projectPath, tool])

  const normalizedMovementStep = useMemo(() => getNormalizedMovementStep(movementStep), [movementStep])
  const normalizedMovementStepDraft = useMemo(() => getNormalizedMovementStep(movementStepDraft), [movementStepDraft])

  const viewportScale = useMemo(() => {
    if (!documentState) return 1
    if (!viewportBounds.width || !viewportBounds.height) return 1
    return Math.max(0.05, Math.min((viewportBounds.width - 48) / documentState.width, (viewportBounds.height - 48) / documentState.height, 1))
  }, [documentState, viewportBounds.height, viewportBounds.width])

  useEffect(() => {
    if (!documentState) return
    let cancelled = false
    const currentDocumentState = documentState

    async function ensureImages() {
      const urls = new Set(currentDocumentState.layers.map(layer => layer.dataUrl))
      if (selectionPreview) {
        urls.add(selectionPreview.layerDataUrl)
        urls.add(selectionPreview.floatingDataUrl)
      }

      const loads = Array.from(urls).map(async url => {
        if (imageCacheRef.current.has(url)) return
        const image = await loadImageElement(url)
        if (!cancelled) {
          imageCacheRef.current.set(url, image)
        }
      })

      await Promise.all(loads)
      if (!cancelled) {
        setImageRevision(revision => revision + 1)
      }
    }

    void ensureImages()
    return () => {
      cancelled = true
    }
  }, [documentState, selectionPreview])

  useEffect(() => {
    const mainCanvas = mainCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    if (!mainCanvas || !overlayCanvas || !documentState) return

    mainCanvas.width = documentState.width
    mainCanvas.height = documentState.height
    overlayCanvas.width = documentState.width
    overlayCanvas.height = documentState.height

    const mainContext = mainCanvas.getContext('2d')
    const overlayContext = overlayCanvas.getContext('2d')
    if (!mainContext || !overlayContext) return

    mainContext.clearRect(0, 0, documentState.width, documentState.height)
    mainContext.fillStyle = '#11141b'
    mainContext.fillRect(0, 0, documentState.width, documentState.height)

    for (const layer of documentState.layers) {
      if (!layer.visible) continue
      const sourceUrl = selectionPreview?.layerId === layer.id ? selectionPreview.layerDataUrl : layer.dataUrl
      const image = imageCacheRef.current.get(sourceUrl)
      if (!image) continue
      mainContext.save()
      mainContext.globalAlpha = layer.opacity
      mainContext.imageSmoothingEnabled = true
      mainContext.drawImage(image, layer.x, layer.y, layer.width, layer.height)
      mainContext.restore()
    }

    if (selectionPreview && activeLayer?.id === selectionPreview.layerId) {
      const floatingImage = imageCacheRef.current.get(selectionPreview.floatingDataUrl)
      if (floatingImage) {
        const rect = getSelectionDocumentRect(activeLayer, selectionPreview.selection)
        mainContext.drawImage(floatingImage, rect.x, rect.y, rect.width, rect.height)
      }
    }

    overlayContext.clearRect(0, 0, documentState.width, documentState.height)

    if (activeLayer) {
      const layerRect = getLayerRect(activeLayer)
      overlayContext.save()
      overlayContext.strokeStyle = '#5f9dff'
      overlayContext.lineWidth = 1.5
      overlayContext.setLineDash([8, 4])
      overlayContext.strokeRect(layerRect.x, layerRect.y, layerRect.width, layerRect.height)
      overlayContext.restore()

      if (tool === 'select') {
        for (const { rect } of getHandles(activeLayer)) {
          overlayContext.fillStyle = '#f7f8fb'
          overlayContext.strokeStyle = '#245cff'
          overlayContext.lineWidth = 1
          overlayContext.fillRect(rect.x, rect.y, rect.width, rect.height)
          overlayContext.strokeRect(rect.x, rect.y, rect.width, rect.height)
        }
      }
    }

    if (documentState.selection && activeLayer && documentState.selection.layerId === activeLayer.id) {
      const selectionRect = getSelectionDocumentRect(activeLayer, documentState.selection)
      overlayContext.save()
      overlayContext.fillStyle = 'rgba(95, 157, 255, 0.12)'
      overlayContext.strokeStyle = '#8fc7ff'
      overlayContext.lineWidth = 1
      overlayContext.setLineDash([5, 3])
      overlayContext.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height)
      overlayContext.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height)
      overlayContext.restore()
    }
  }, [activeLayer, documentState, imageRevision, selectionPreview, tool])

  function pushHistory(label: string, previousDocument: EditorDocument, nextDocument: EditorDocument) {
    setDocumentState(nextDocument)
    setHistory(current => ({
      past: [...current.past, { label, document: cloneDocument(previousDocument) }],
      future: [],
    }))
  }

  function setCommittedDocument(documentValue: EditorDocument, label: string) {
    setDocumentState(current => {
      if (!current) {
        setHistory({ past: [], future: [] })
        return documentValue
      }
      setHistory(historyState => ({
        past: [...historyState.past, { label, document: cloneDocument(current) }],
        future: [],
      }))
      return documentValue
    })
  }

  function createNewDocument(width: number, height: number) {
    startNewProject(width, height)
  }

  function setCanvasSize(width: number, height: number) {
    setCanvasDraft({ width: String(width), height: String(height) })
    if (!documentState) {
      createNewDocument(width, height)
      return
    }
    setCommittedDocument({ ...cloneDocument(documentState), width, height }, 'Resize canvas')
  }

  function applyPasteSize(widthValue: string, heightValue: string) {
    if (!documentState) return

    const hasWidth = widthValue.trim().length > 0
    const hasHeight = heightValue.trim().length > 0
    const pasteWidth = hasWidth ? Math.max(1, Math.round(Number(widthValue))) : null
    const pasteHeight = hasHeight ? Math.max(1, Math.round(Number(heightValue))) : null
    if ((hasWidth && pasteWidth === null) || (hasHeight && pasteHeight === null)) {
      setErrorMessage('Paste width and height must be valid numbers when provided')
      return
    }
    if ((hasWidth && !Number.isFinite(pasteWidth)) || (hasHeight && !Number.isFinite(pasteHeight))) {
      setErrorMessage('Paste width and height must be valid numbers when provided')
      return
    }

    setDocumentState({
      ...documentState,
      pasteWidth,
      pasteHeight,
    })
  }

  async function importFiles(files: FileList | File[]) {
    if (!documentState) return
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (!imageFiles.length) return

    try {
      let nextDocument = cloneDocument(documentState)
      for (const file of imageFiles) {
        const layer = await createLayerFromFile(file, nextDocument)
        nextDocument = {
          ...nextDocument,
          layers: [...nextDocument.layers, layer],
          activeLayerId: layer.id,
          selection: null,
        }
      }
      pushHistory(imageFiles.length > 1 ? 'Place images' : 'Place image', documentState, nextDocument)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import image')
    }
  }

  function deleteLayer(layerId: string) {
    if (!documentState) return
    const layerIndex = documentState.layers.findIndex(layer => layer.id === layerId)
    if (layerIndex === -1) return

    const nextLayers = documentState.layers.filter(layer => layer.id !== layerId)
    const nextActiveLayerId =
      documentState.activeLayerId === layerId
        ? (nextLayers[Math.min(layerIndex, nextLayers.length - 1)]?.id ?? null)
        : documentState.activeLayerId

    const nextDocument: EditorDocument = {
      ...documentState,
      layers: nextLayers,
      activeLayerId: nextActiveLayerId,
      selection: documentState.selection?.layerId === layerId ? null : documentState.selection,
    }

    pushHistory('Delete image', documentState, nextDocument)
  }

  function moveLayer(layerId: string, direction: 'up' | 'down') {
    if (!documentState) return
    const currentIndex = documentState.layers.findIndex(layer => layer.id === layerId)
    if (currentIndex === -1) return

    const targetIndex = direction === 'up' ? currentIndex + 1 : currentIndex - 1
    if (targetIndex < 0 || targetIndex >= documentState.layers.length) return

    const nextDocument: EditorDocument = {
      ...documentState,
      layers: moveArrayItem(documentState.layers, currentIndex, targetIndex),
    }

    pushHistory(direction === 'up' ? 'Move layer up' : 'Move layer down', documentState, nextDocument)
  }

  function handleUndo() {
    setHistory(currentHistory => {
      const currentDocumentState = documentStateRef.current
      const previousEntry = currentHistory.past[currentHistory.past.length - 1]
      if (!previousEntry || !currentDocumentState) return currentHistory
      setDocumentState(previousEntry.document)
      setInteraction(null)
      setSelectionPreview(null)
      return {
        past: currentHistory.past.slice(0, -1),
        future: [{ label: previousEntry.label, document: cloneDocument(currentDocumentState) }, ...currentHistory.future],
      }
    })
  }

  function handleRedo() {
    setHistory(currentHistory => {
      const currentDocumentState = documentStateRef.current
      const [nextEntry, ...remainingFuture] = currentHistory.future
      if (!nextEntry || !currentDocumentState) return currentHistory
      setDocumentState(nextEntry.document)
      setInteraction(null)
      setSelectionPreview(null)
      return {
        past: [...currentHistory.past, { label: nextEntry.label, document: cloneDocument(currentDocumentState) }],
        future: remainingFuture,
      }
    })
  }

  useShortcuts([
    {
      code: [
        { code: 'KeyZ', metaKey: true },
        { code: 'KeyZ', ctrlKey: true },
      ],
      handler: () => handleUndo(),
      label: '[Editor] Undo',
    },
    {
      code: [
        { code: 'KeyZ', metaKey: true, shiftKey: true },
        { code: 'KeyZ', ctrlKey: true, shiftKey: true },
      ],
      handler: () => handleRedo(),
      label: '[Editor] Redo',
    },
    {
      code: [
        { code: 'KeyS', metaKey: true },
        { code: 'KeyS', ctrlKey: true },
      ],
      handler: event => {
        event?.preventDefault()
        void saveFinalImage()
      },
      label: '[Editor] Save final image',
    },
    activeLayer && {
      code: ['Backspace', 'Delete'],
      handler: event => {
        event?.preventDefault()
        deleteLayer(activeLayer.id)
      },
      label: '[Editor] Delete selected image',
    },
  ])

  function finalizeInteraction(label: string) {
    if (!interaction || !documentState) return
    if (documentsEqual(interaction.initialDocument, documentState)) {
      setInteraction(null)
      return
    }
    setHistory(current => ({
      past: [...current.past, { label, document: cloneDocument(interaction.initialDocument) }],
      future: [],
    }))
    setInteraction(null)
  }

  function cancelInteraction() {
    if (!interaction) return
    setDocumentState(cloneDocument(interaction.initialDocument))
    setInteraction(null)
    setSelectionPreview(null)
  }

  async function startSelectionMove(selection: PixelSelection, layer: ImageLayer, pointer: Point) {
    if (!documentState) return
    const currentDocument = cloneDocument(documentState)
    const draft = await cutSelectionFromLayer(layer, selection)
    setDocumentState(replaceActiveLayerData(currentDocument, layer.id, draft.cutLayerDataUrl))
    setSelectionPreview({
      layerId: layer.id,
      floatingDataUrl: draft.floatingDataUrl,
      layerDataUrl: draft.cutLayerDataUrl,
      selection,
    })
    setInteraction({
      type: 'moving-selection',
      initialDocument: cloneDocument(documentState),
      layerId: layer.id,
      selectionStart: selection,
      pointerStart: pointer,
      cutLayerDataUrl: draft.cutLayerDataUrl,
      floatingDataUrl: draft.floatingDataUrl,
    })
  }

  function beginLayerMove(layer: ImageLayer, pointer: Point) {
    if (!documentState) return
    setDocumentState({ ...documentState, activeLayerId: layer.id, selection: null })
    setInteraction({
      type: 'moving-layer',
      initialDocument: cloneDocument(documentState),
      layerId: layer.id,
      pointerStart: pointer,
      layerStart: getLayerRect(layer),
    })
  }

  function beginResize(layer: ImageLayer, pointer: Point, handle: ResizeHandle) {
    if (!documentState) return
    setDocumentState({ ...documentState, activeLayerId: layer.id, selection: null })
    setInteraction({
      type: 'resizing-layer',
      initialDocument: cloneDocument(documentState),
      layerId: layer.id,
      handle,
      pointerStart: pointer,
      layerStart: getLayerRect(layer),
      aspectRatio: layer.width / layer.height,
    })
  }

  function updateLayerMove(pointer: Point) {
    if (!interaction || interaction.type !== 'moving-layer' || !documentState) return
    const deltaX = Math.round(pointer.x - interaction.pointerStart.x)
    const deltaY = Math.round(pointer.y - interaction.pointerStart.y)
    setDocumentState(
      updateLayer(documentState, interaction.layerId, layer => ({
        ...layer,
        x: snapToStep(interaction.layerStart.x + deltaX, normalizedMovementStep),
        y: snapToStep(interaction.layerStart.y + deltaY, normalizedMovementStep),
      }))
    )
  }

  function updateLayerResize(pointer: Point, keepAspectRatio: boolean) {
    if (!interaction || interaction.type !== 'resizing-layer' || !documentState) return
    const deltaX = pointer.x - interaction.pointerStart.x
    const deltaY = pointer.y - interaction.pointerStart.y
    let nextRect = { ...interaction.layerStart }

    if (interaction.handle.includes('e')) {
      nextRect.width = Math.max(1, interaction.layerStart.width + deltaX)
    }
    if (interaction.handle.includes('s')) {
      nextRect.height = Math.max(1, interaction.layerStart.height + deltaY)
    }
    if (interaction.handle.includes('w')) {
      nextRect.x = interaction.layerStart.x + deltaX
      nextRect.width = Math.max(1, interaction.layerStart.width - deltaX)
    }
    if (interaction.handle.includes('n')) {
      nextRect.y = interaction.layerStart.y + deltaY
      nextRect.height = Math.max(1, interaction.layerStart.height - deltaY)
    }

    if (keepAspectRatio) {
      const ratio = interaction.aspectRatio
      const basedOnWidth = Math.abs(deltaX) >= Math.abs(deltaY)
      if (basedOnWidth) {
        nextRect.height = Math.max(1, nextRect.width / ratio)
        if (interaction.handle.includes('n')) {
          nextRect.y = interaction.layerStart.y + interaction.layerStart.height - nextRect.height
        }
      } else {
        nextRect.width = Math.max(1, nextRect.height * ratio)
        if (interaction.handle.includes('w')) {
          nextRect.x = interaction.layerStart.x + interaction.layerStart.width - nextRect.width
        }
      }
    }

    setDocumentState(
      updateLayer(documentState, interaction.layerId, layer => ({
        ...layer,
        x: Math.round(nextRect.x),
        y: Math.round(nextRect.y),
        width: Math.max(1, Math.round(nextRect.width)),
        height: Math.max(1, Math.round(nextRect.height)),
      }))
    )
  }

  function updateSelectionCreation(pointer: Point) {
    if (!interaction || interaction.type !== 'creating-selection' || !documentState) return
    const layer = documentState.layers.find(currentLayer => currentLayer.id === interaction.layerId)
    if (!layer) return
    const selection = selectionFromDrag(layer, interaction.start, pointer)
    setDocumentState({ ...documentState, activeLayerId: layer.id, selection })
  }

  function updateSelectionMove(pointer: Point) {
    if (!interaction || interaction.type !== 'moving-selection' || !documentState || !selectionPreview) return
    const layer = documentState.layers.find(currentLayer => currentLayer.id === interaction.layerId)
    if (!layer) return

    const deltaDocumentX = pointer.x - interaction.pointerStart.x
    const deltaDocumentY = pointer.y - interaction.pointerStart.y
    const deltaPixelX = Math.round((deltaDocumentX / layer.width) * layer.pixelWidth)
    const deltaPixelY = Math.round((deltaDocumentY / layer.height) * layer.pixelHeight)
    const maxX = layer.pixelWidth - interaction.selectionStart.width
    const maxY = layer.pixelHeight - interaction.selectionStart.height

    const selection = {
      ...interaction.selectionStart,
      x: clamp(interaction.selectionStart.x + deltaPixelX, 0, Math.max(0, maxX)),
      y: clamp(interaction.selectionStart.y + deltaPixelY, 0, Math.max(0, maxY)),
    }

    setDocumentState({ ...documentState, selection })
    setSelectionPreview({
      ...selectionPreview,
      selection,
    })
  }

  async function finishSelectionMove() {
    if (!interaction || interaction.type !== 'moving-selection' || !documentState || !documentState.selection) return
    if (
      documentState.selection.x === interaction.selectionStart.x &&
      documentState.selection.y === interaction.selectionStart.y
    ) {
      setDocumentState(cloneDocument(interaction.initialDocument))
      setSelectionPreview(null)
      setInteraction(null)
      return
    }
    const layer = documentState.layers.find(currentLayer => currentLayer.id === interaction.layerId)
    if (!layer) return

    const dataUrl = await applyFloatingSelectionToLayer({
      layer,
      cutLayerDataUrl: interaction.cutLayerDataUrl,
      floatingDataUrl: interaction.floatingDataUrl,
      destinationX: documentState.selection.x,
      destinationY: documentState.selection.y,
      width: documentState.selection.width,
      height: documentState.selection.height,
    })

    const nextDocument = replaceActiveLayerData(documentState, layer.id, dataUrl)
    setDocumentState(nextDocument)
    setSelectionPreview(null)
    setHistory(current => ({
      past: [...current.past, { label: 'Move selection', document: cloneDocument(interaction.initialDocument) }],
      future: [],
    }))
    setInteraction(null)
  }

  function findHandle(layer: ImageLayer, point: Point): ResizeHandle | null {
    for (const item of getHandles(layer)) {
      if (pointInRect(point, item.rect)) {
        return item.handle
      }
    }
    return null
  }

  async function handleCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!documentState) return
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const pointer = getPointerOnCanvas(event, canvas)
    const layer = hitLayer(documentState.layers, pointer)
    canvas.setPointerCapture(event.pointerId)

    if (tool === 'select') {
      if (layer) {
        const handle = findHandle(layer, pointer)
        if (handle) {
          beginResize(layer, pointer, handle)
          return
        }
        beginLayerMove(layer, pointer)
        return
      }
      setDocumentState({ ...documentState, activeLayerId: null, selection: null })
      return
    }

    if (tool === 'marquee') {
      const currentSelection = documentState.selection
      if (currentSelection && activeLayer && currentSelection.layerId === activeLayer.id) {
        const selectionRect = getSelectionDocumentRect(activeLayer, currentSelection)
        if (pointInRect(pointer, selectionRect)) {
          await startSelectionMove(currentSelection, activeLayer, pointer)
          return
        }
      }

      if (layer) {
        setDocumentState({ ...documentState, activeLayerId: layer.id, selection: null })
        setInteraction({
          type: 'creating-selection',
          initialDocument: cloneDocument(documentState),
          layerId: layer.id,
          start: pointer,
        })
        return
      }

      setDocumentState({ ...documentState, selection: null })
    }
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!interaction) return
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const pointer = getPointerOnCanvas(event, canvas)

    if (interaction.type === 'moving-layer') {
      updateLayerMove(pointer)
      return
    }
    if (interaction.type === 'resizing-layer') {
      updateLayerResize(pointer, event.shiftKey)
      return
    }
    if (interaction.type === 'creating-selection') {
      updateSelectionCreation(pointer)
      return
    }
    if (interaction.type === 'moving-selection') {
      updateSelectionMove(pointer)
    }
  }

  async function handleCanvasPointerUp() {
    if (!interaction || !documentState) return
    if (interaction.type === 'moving-layer') {
      finalizeInteraction('Move image')
      return
    }
    if (interaction.type === 'resizing-layer') {
      finalizeInteraction('Resize image')
      return
    }
    if (interaction.type === 'creating-selection') {
      finalizeInteraction('Create selection')
      return
    }
    if (interaction.type === 'moving-selection') {
      await finishSelectionMove()
    }
  }

  function handleCanvasPointerCancel() {
    cancelInteraction()
  }

  const layerMenu = useContextMenu<string>()

  function openSizeDialog(layerId: string) {
    const layer = documentState?.layers.find(item => item.id === layerId)
    if (!layer) return
    setSizeDialog({
      layerId,
      width: String(Math.round(layer.width)),
      height: String(Math.round(layer.height)),
      keepAspectRatio: true,
    })
  }

  function openPositionDialog(layerId: string) {
    const layer = documentState?.layers.find(item => item.id === layerId)
    if (!layer) return
    setPositionDialog({
      layerId,
      x: String(Math.round(layer.x)),
      y: String(Math.round(layer.y)),
    })
  }

  function applyExactSize() {
    if (!documentState || !sizeDialog) return
    const layer = documentState.layers.find(item => item.id === sizeDialog.layerId)
    if (!layer) return

    let width = Math.max(1, Math.round(Number(sizeDialog.width)))
    let height = Math.max(1, Math.round(Number(sizeDialog.height)))
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setErrorMessage('Width and height must be valid numbers')
      return
    }

    if (sizeDialog.keepAspectRatio) {
      const ratio = layer.width / layer.height
      if (sizeDialog.width !== String(Math.round(layer.width))) {
        height = Math.max(1, Math.round(width / ratio))
      } else {
        width = Math.max(1, Math.round(height * ratio))
      }
    }

    const nextDocument = updateLayer(documentState, layer.id, currentLayer => ({
      ...currentLayer,
      width,
      height,
    }))

    pushHistory('Set exact size', documentState, nextDocument)
    setSizeDialog(null)
  }

  function applyExactPosition() {
    if (!documentState || !positionDialog) return
    const layer = documentState.layers.find(item => item.id === positionDialog.layerId)
    if (!layer) return

    const x = snapToStep(Math.round(Number(positionDialog.x)), normalizedMovementStep)
    const y = snapToStep(Math.round(Number(positionDialog.y)), normalizedMovementStep)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setErrorMessage('Position coordinates must be valid numbers')
      return
    }

    const nextDocument = updateLayer(documentState, layer.id, currentLayer => ({
      ...currentLayer,
      x,
      y,
    }))

    pushHistory('Set exact position', documentState, nextDocument)
    setPositionDialog(null)
  }

  function applyInspectorPosition() {
    if (!documentState || !activeLayer || !layerPositionDraft || layerPositionDraft.layerId !== activeLayer.id) return

    const x = snapToStep(Math.round(Number(layerPositionDraft.x)), normalizedMovementStep)
    const y = snapToStep(Math.round(Number(layerPositionDraft.y)), normalizedMovementStep)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setErrorMessage('Position coordinates must be valid numbers')
      return
    }

    const nextDocument = updateLayer(documentState, activeLayer.id, layer => ({
      ...layer,
      x,
      y,
    }))

    pushHistory('Set exact position', documentState, nextDocument)
  }

  function applyInspectorSize() {
    if (!documentState || !activeLayer || !layerSizeDraft || layerSizeDraft.layerId !== activeLayer.id) return

    const width = Math.max(1, Math.round(Number(layerSizeDraft.width)))
    const height = Math.max(1, Math.round(Number(layerSizeDraft.height)))
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setErrorMessage('Width and height must be valid numbers')
      return
    }

    const nextDocument = updateLayer(documentState, activeLayer.id, layer => ({
      ...layer,
      width,
      height,
    }))

    pushHistory('Set exact size', documentState, nextDocument)
  }

  async function saveFinalImage() {
    if (!documentState || !mainCanvasRef.current || isSaving) return

    try {
      setIsSaving(true)
      const dataUrl = mainCanvasRef.current.toDataURL('image/png')
      const defaultFileName = `kopa-${documentState.width}x${documentState.height}.png`
      await getWindowElectron().saveFinalImage({ dataUrl, defaultFileName })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save image')
    } finally {
      setIsSaving(false)
    }
  }

  const isInspectorPositionUnchanged =
    !!activeLayer &&
    !!layerPositionDraft &&
    layerPositionDraft.layerId === activeLayer.id &&
    snapToStep(Number(layerPositionDraft.x), normalizedMovementStep) === Math.round(activeLayer.x) &&
    snapToStep(Number(layerPositionDraft.y), normalizedMovementStep) === Math.round(activeLayer.y)

  const isInspectorSizeUnchanged =
    !!activeLayer &&
    !!layerSizeDraft &&
    layerSizeDraft.layerId === activeLayer.id &&
    Number(layerSizeDraft.width) === Math.round(activeLayer.width) &&
    Number(layerSizeDraft.height) === Math.round(activeLayer.height)

  function applyCanvasDraft() {
    const width = Math.max(1, Math.round(Number(canvasDraft.width)))
    const height = Math.max(1, Math.round(Number(canvasDraft.height)))
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setErrorMessage('Canvas size must be valid numbers')
      return
    }
    setCanvasSize(width, height)
  }

  const contextLayerId = layerMenu.item
  const menuItems = contextLayerId
    ? [
        {
          view: 'Delete Image',
          onClick: () => deleteLayer(contextLayerId),
        },
        { isSeparator: true as const },
        {
          view: 'Set Position...',
          onClick: () => openPositionDialog(contextLayerId),
        },
        {
          view: 'Set Size...',
          onClick: () => openSizeDialog(contextLayerId),
        },
      ]
    : []

  return (
    <div className="flex h-full min-h-0 flex-col bg-base-100 text-base-content">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-18 flex-col items-center gap-3 border-r border-base-content/10 px-3 py-4">
          <button
            className={cn('btn btn-square btn-sm', tool === 'select' ? 'btn-info' : 'btn-ghost')}
            onClick={() => setTool('select')}
            title="Select and transform images"
          >
            <MousePointer2Icon className="size-4" />
          </button>
          <button
            className={cn('btn btn-square btn-sm', tool === 'marquee' ? 'btn-info' : 'btn-ghost')}
            onClick={() => setTool('marquee')}
            title="Create a rectangular pixel selection"
          >
            <ScanLineIcon className="size-4" />
          </button>
          <div className="mt-6 flex flex-col gap-2">
            <button className="btn btn-square btn-sm btn-ghost" onClick={handleUndo} disabled={!history.past.length} title="Undo">
              <Undo2Icon className="size-4" />
            </button>
            <button className="btn btn-square btn-sm btn-ghost" onClick={handleRedo} disabled={!history.future.length} title="Redo">
              <Redo2Icon className="size-4" />
            </button>
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-base-content/10 px-4 py-3">
            <Button className="btn-sm btn-soft" onClick={() => createNewDocument(1024, 1024)}>
              New Project
            </Button>
            <Button icon={FolderOpenIcon} className="btn-sm btn-soft" onClick={() => void handleOpenProject()}>
              Open Project
            </Button>
            <Button className="btn-sm btn-soft" onClick={() => void handleSaveProject()} disabled={isProjectSaving}>
              {projectPath ? 'Save Project' : 'Save Project As'}
            </Button>
            <Button icon={ImagePlusIcon} className="btn-sm" onClick={() => inputRef.current?.click()} disabled={!documentState}>
              Place image
            </Button>
            <Button icon={SaveIcon} className="btn-sm" onClick={() => void saveFinalImage()} disabled={!documentState || isSaving}>
              Save PNG
            </Button>
            <div className="text-sm text-base-content/70">
              <span className="font-medium text-base-content">{projectName}</span>
              {hasUnsavedChanges ? ' *' : ''}
              {documentState ? ` • Canvas ${documentState.width} x ${documentState.height}` : ''}
            </div>
            <div className="ml-auto text-xs text-base-content/50">
              {projectPath ? `Folder: ${projectPath}` : 'Project not saved yet.'}
            </div>
            <div className="text-xs text-base-content/50">
              Hold <kbd className="kbd kbd-xs">Shift</kbd> while resizing to keep aspect ratio.
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              multiple
              onChange={event => {
                if (event.target.files) {
                  void importFiles(event.target.files)
                  event.target.value = ''
                }
              }}
            />
          </div>

          <div className="flex min-h-0 flex-1">
            <section
              ref={viewportRef}
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(95,157,255,0.15),_transparent_40%),linear-gradient(180deg,rgba(18,22,31,1),rgba(12,14,19,1))]"
              onDragOver={event => {
                event.preventDefault()
              }}
              onDrop={event => {
                event.preventDefault()
                if (event.dataTransfer.files.length) {
                  void importFiles(event.dataTransfer.files)
                }
              }}
            >
              {!documentState && (
                <div className="w-full max-w-3xl rounded-3xl border border-base-content/10 bg-base-200/85 p-8 shadow-2xl backdrop-blur">
                  <div className="mb-6">
                    <div className="text-3xl font-semibold">Start a project</div>
                    <p className="mt-2 max-w-xl text-sm text-base-content/70">
                      Projects now live on disk with reusable history and image assets, so you can return to previous work and switch between saved canvases.
                    </p>
                  </div>
                  {recentProjects.length > 0 && (
                    <div className="mb-8 rounded-2xl border border-base-content/10 bg-base-100/70 p-4">
                      <div className="mb-3 text-sm font-medium">Recent projects</div>
                      <div className="space-y-2">
                        {recentProjects.map(project => (
                          <button
                            key={project.projectPath}
                            className="flex w-full items-start justify-between rounded-xl border border-base-content/10 bg-base-100 px-3 py-3 text-left transition hover:border-info/60 hover:bg-base-300"
                            onClick={() => void handleOpenRecentProject(project.projectPath)}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">{project.name}</div>
                              <div className="truncate text-xs text-base-content/55">{project.projectPath}</div>
                            </div>
                            <div className="ml-3 shrink-0 text-[11px] text-base-content/45">{new Date(project.updatedAt).toLocaleDateString()}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-4">
                    {DOCUMENT_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        className="rounded-2xl border border-base-content/10 bg-base-100 px-4 py-5 text-left transition hover:border-info/60 hover:bg-base-300"
                        onClick={() => createNewDocument(preset.width, preset.height)}
                      >
                        <div className="font-medium">{preset.label}</div>
                        <div className="mt-1 text-sm text-base-content/65">
                          {preset.width} x {preset.height}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-8 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <label className="form-control gap-2">
                      <span className="label text-sm">Custom width</span>
                      <input
                        className="input"
                        value={canvasDraft.width}
                        onChange={event => setCanvasDraft(current => ({ ...current, width: event.target.value }))}
                      />
                    </label>
                    <label className="form-control gap-2">
                      <span className="label text-sm">Custom height</span>
                      <input
                        className="input"
                        value={canvasDraft.height}
                        onChange={event => setCanvasDraft(current => ({ ...current, height: event.target.value }))}
                      />
                    </label>
                    <Button onClick={applyCanvasDraft}>Create canvas</Button>
                  </div>
                </div>
              )}

              {documentState && (
                <div
                  className="relative rounded-2xl border border-white/10 bg-[#11141b] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
                  onContextMenu={event => {
                    if (!documentState || !activeLayer) return
                    const canvas = overlayCanvasRef.current
                    if (!canvas) return
                    const pointer = getPointerOnCanvas(event as unknown as React.PointerEvent<HTMLCanvasElement>, canvas)
                    const hit = hitLayer(documentState.layers, pointer)
                    if (!hit) return
                    layerMenu.onRightClick(event, hit.id)
                  }}
                >
                  <canvas
                    ref={mainCanvasRef}
                    className="block"
                    style={{ width: documentState.width * viewportScale, height: documentState.height * viewportScale }}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 block"
                    style={{ width: documentState.width * viewportScale, height: documentState.height * viewportScale }}
                    onPointerDown={event => void handleCanvasPointerDown(event)}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={() => void handleCanvasPointerUp()}
                    onPointerCancel={handleCanvasPointerCancel}
                  />
                </div>
              )}

              {layerMenu.isOpen && menuItems.length > 0 && (
                <ContextMenu menu={layerMenu}>
                  <ContextMenuList items={menuItems} />
                </ContextMenu>
              )}
            </section>

            <aside className="flex min-h-0 w-80 flex-col gap-5 overflow-y-auto border-l border-base-content/10 px-4 py-4">
              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">Project</div>
                <div className="space-y-3 rounded-2xl border border-base-content/10 bg-base-200/60 p-4 text-sm text-base-content/70">
                  <form
                    className="space-y-2"
                    onSubmit={event => {
                      event.preventDefault()
                      applyProjectName()
                    }}
                  >
                    <label className="form-control gap-2">
                      <span className="label text-xs">Project name</span>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input
                          className="input input-sm"
                          value={projectNameDraft.value}
                          onChange={event => setProjectNameDraft({ value: event.target.value })}
                        />
                        <button
                          type="submit"
                          className="btn btn-sm btn-info"
                          disabled={projectNameDraft.value.trim().length === 0 || projectNameDraft.value.trim() === projectName}
                        >
                          Rename
                        </button>
                      </div>
                    </label>
                    <div className="break-all text-xs text-base-content/55">{projectPath ?? 'Unsaved project folder'}</div>
                  </form>
                  <div className="text-xs text-base-content/55">
                    {hasUnsavedChanges ? 'Changes pending save.' : 'Project is saved.'}
                  </div>
                  <div className="flex gap-2">
                    <Button className="btn-sm flex-1" onClick={() => void handleSaveProject()} disabled={isProjectSaving}>
                      Save
                    </Button>
                    <Button className="btn-sm btn-soft flex-1" onClick={() => void handleOpenProject()}>
                      Open
                    </Button>
                  </div>
                  {recentProjects.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Switch project</div>
                      <div className="space-y-2">
                        {recentProjects.map(project => (
                          <button
                            key={project.projectPath}
                            className={cn(
                              'w-full rounded-xl border px-3 py-2 text-left text-xs transition',
                              project.projectPath === projectPath
                                ? 'border-info/60 bg-info/10 text-base-content'
                                : 'border-base-content/10 bg-base-100/40 text-base-content/75 hover:border-info/60 hover:bg-base-100'
                            )}
                            onClick={() => void handleOpenRecentProject(project.projectPath)}
                          >
                            <div className="truncate font-medium">{project.name}</div>
                            <div className="truncate text-[11px] text-base-content/50">{project.projectPath}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">Document</div>
                {documentState ? (
                    <div className="space-y-3 rounded-2xl border border-base-content/10 bg-base-200/60 p-4">
                      <form
                        className="space-y-2"
                        onSubmit={event => {
                          event.preventDefault()
                          applyCanvasDraft()
                        }}
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Canvas size</div>
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <label className="form-control gap-1">
                            <span className="label text-[11px]">W</span>
                            <input
                              className="input input-xs"
                              value={canvasDraft.width}
                              onChange={event => setCanvasDraft(current => ({ ...current, width: event.target.value }))}
                            />
                          </label>
                          <label className="form-control gap-1">
                            <span className="label text-[11px]">H</span>
                            <input
                              className="input input-xs"
                              value={canvasDraft.height}
                              onChange={event => setCanvasDraft(current => ({ ...current, height: event.target.value }))}
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="submit"
                              className="btn btn-xs btn-info w-full"
                              disabled={
                                Number(canvasDraft.width) === documentState.width && Number(canvasDraft.height) === documentState.height
                              }
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </form>
                      <form
                        className="space-y-2"
                        onSubmit={event => {
                          event.preventDefault()
                          applyPasteSize(pasteSizeDraft.width, pasteSizeDraft.height)
                        }}
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Paste size</div>
                        <div className="text-xs text-base-content/55">Leave blank to use the image's actual size.</div>
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <label className="form-control gap-1">
                            <span className="label text-[11px]">W</span>
                            <input
                              className="input input-xs"
                              value={pasteSizeDraft.width}
                              placeholder="auto"
                              onChange={event => setPasteSizeDraft(current => ({ ...current, width: event.target.value }))}
                            />
                          </label>
                          <label className="form-control gap-1">
                            <span className="label text-[11px]">H</span>
                            <input
                              className="input input-xs"
                              value={pasteSizeDraft.height}
                              placeholder="auto"
                              onChange={event => setPasteSizeDraft(current => ({ ...current, height: event.target.value }))}
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="submit"
                              className="btn btn-xs btn-info w-full"
                              disabled={
                                (pasteSizeDraft.width.trim().length ? Number(pasteSizeDraft.width) : null) === documentState.pasteWidth &&
                                (pasteSizeDraft.height.trim().length ? Number(pasteSizeDraft.height) : null) === documentState.pasteHeight
                              }
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </form>
                      <form
                        className="space-y-2"
                        onSubmit={event => {
                          event.preventDefault()
                          applyMovementStep()
                        }}
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Movement step</div>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <label className="form-control gap-1">
                            <span className="label text-[11px]">PX</span>
                            <input
                              className="input input-xs"
                              value={movementStepDraft}
                              onChange={event => setMovementStepDraft(event.target.value)}
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="submit"
                              className="btn btn-xs btn-info w-full"
                              disabled={movementStep === String(normalizedMovementStepDraft)}
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </form>
                      <div className="text-xs text-base-content/55">
                        Image placement snaps to multiples of {normalizedMovementStep} px.
                      </div>
                   </div>
                ) : (
                  <p className="text-sm text-base-content/60">Pick a preset or enter a custom canvas size to begin.</p>
                )}
              </section>

              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">Selection</div>
                <div className="rounded-2xl border border-base-content/10 bg-base-200/60 p-4 text-sm text-base-content/70">
                  {documentState?.selection && activeLayer ? (
                    <div className="space-y-1">
                      <div>Layer: {activeLayer.name}</div>
                      <div>Origin: {formatPixels(documentState.selection.x)}, {formatPixels(documentState.selection.y)}</div>
                      <div>Size: {formatPixels(documentState.selection.width)} x {formatPixels(documentState.selection.height)}</div>
                    </div>
                  ) : (
                    <div>Use the marquee tool to select an area on the active image, then drag inside it to move the pixels.</div>
                  )}
                </div>
              </section>

              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">Active image</div>
                <div className="rounded-2xl border border-base-content/10 bg-base-200/60 p-4 text-sm text-base-content/70">
                  {activeLayer ? (
                    <div className="space-y-3">
                      <div className="font-medium text-base-content">{activeLayer.name}</div>
                      <div>Position: {formatPixels(activeLayer.x)}, {formatPixels(activeLayer.y)}</div>
                      <div>Display size: {formatPixels(activeLayer.width)} x {formatPixels(activeLayer.height)}</div>
                      <div>Raster size: {formatPixels(activeLayer.pixelWidth)} x {formatPixels(activeLayer.pixelHeight)}</div>
                      {layerPositionDraft && layerSizeDraft && layerPositionDraft.layerId === activeLayer.id && layerSizeDraft.layerId === activeLayer.id && (
                        <>
                          <form
                            className="space-y-2"
                            onSubmit={event => {
                              event.preventDefault()
                              applyInspectorPosition()
                            }}
                          >
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Placement</div>
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                              <label className="form-control gap-1">
                                <span className="label text-[11px]">X</span>
                                <input
                                  className="input input-xs"
                                  value={layerPositionDraft.x}
                                  onChange={event =>
                                    setLayerPositionDraft(current =>
                                      current ? { ...current, x: event.target.value } : current
                                    )
                                  }
                                />
                              </label>
                              <label className="form-control gap-1">
                                <span className="label text-[11px]">Y</span>
                                <input
                                  className="input input-xs"
                                  value={layerPositionDraft.y}
                                  onChange={event =>
                                    setLayerPositionDraft(current =>
                                      current ? { ...current, y: event.target.value } : current
                                    )
                                  }
                                />
                              </label>
                              <div className="flex items-end">
                                <button type="submit" className="btn btn-xs btn-info w-full" disabled={isInspectorPositionUnchanged}>
                                  Apply
                                </button>
                              </div>
                            </div>
                          </form>

                          <form
                            className="space-y-2"
                            onSubmit={event => {
                              event.preventDefault()
                              applyInspectorSize()
                            }}
                          >
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Exact size</div>
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                              <label className="form-control gap-1">
                                <span className="label text-[11px]">W</span>
                                <input
                                  className="input input-xs"
                                  value={layerSizeDraft.width}
                                  onChange={event =>
                                    setLayerSizeDraft(current =>
                                      current ? { ...current, width: event.target.value } : current
                                    )
                                  }
                                />
                              </label>
                              <label className="form-control gap-1">
                                <span className="label text-[11px]">H</span>
                                <input
                                  className="input input-xs"
                                  value={layerSizeDraft.height}
                                  onChange={event =>
                                    setLayerSizeDraft(current =>
                                      current ? { ...current, height: event.target.value } : current
                                    )
                                  }
                                />
                              </label>
                              <div className="flex items-end">
                                <button type="submit" className="btn btn-xs btn-info w-full" disabled={isInspectorSizeUnchanged}>
                                  Apply
                                </button>
                              </div>
                            </div>
                          </form>
                        </>
                      )}
                    </div>
                  ) : (
                    <div>Select an image to inspect or resize it.</div>
                  )}
                </div>
              </section>

              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">Layers</div>
                <div className="rounded-2xl border border-base-content/10 bg-base-200/60 p-3 text-sm text-base-content/70">
                  {documentState && documentState.layers.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs text-base-content/55">Top to bottom order. Use the arrows to change stacking.</div>
                      {[...documentState.layers].reverse().map(layer => {
                        const originalIndex = documentState.layers.findIndex(currentLayer => currentLayer.id === layer.id)
                        const canMoveUp = originalIndex < documentState.layers.length - 1
                        const canMoveDown = originalIndex > 0
                        const isActive = activeLayer?.id === layer.id

                        return (
                          <div
                            key={layer.id}
                            className={cn(
                              'flex items-center gap-2 rounded-xl border px-2 py-2',
                              isActive ? 'border-info/60 bg-info/10' : 'border-base-content/10 bg-base-100/40'
                            )}
                          >
                            <button
                              className={cn('min-w-0 flex-1 text-left text-sm', isActive ? 'text-base-content' : 'text-base-content/75')}
                              onClick={() => setDocumentState(current => (current ? { ...current, activeLayerId: layer.id } : current))}
                            >
                              <div className="truncate font-medium">{layer.name}</div>
                            </button>
                            <button className="btn btn-xs btn-ghost" onClick={() => moveLayer(layer.id, 'up')} disabled={!canMoveUp} title="Move toward front">
                              ↑
                            </button>
                            <button className="btn btn-xs btn-ghost" onClick={() => moveLayer(layer.id, 'down')} disabled={!canMoveDown} title="Move toward back">
                              ↓
                            </button>
                            <button className="btn btn-xs btn-ghost text-error" onClick={() => deleteLayer(layer.id)} title="Delete image">
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div>No images placed yet.</div>
                  )}
                </div>
              </section>

              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">History</div>
                <div className="rounded-2xl border border-base-content/10 bg-base-200/60 p-4 text-sm text-base-content/70">
                  <div>{history.past.length} undo step(s)</div>
                  <div>{history.future.length} redo step(s)</div>
                </div>
              </section>
            </aside>
          </div>

          <div className="flex items-center justify-between border-t border-base-content/10 px-4 py-2 text-xs text-base-content/55">
            <div>
              Tool: <span className="text-base-content/80">{tool === 'select' ? 'Select' : 'Marquee'}</span>
            </div>
            <div>
              Shortcuts: <kbd className="kbd kbd-xs">Cmd</kbd> + <kbd className="kbd kbd-xs">Z</kbd> undo, <kbd className="kbd kbd-xs">Shift</kbd> + <kbd className="kbd kbd-xs">Cmd</kbd> + <kbd className="kbd kbd-xs">Z</kbd> redo
            </div>
          </div>
        </main>
      </div>

      {sizeDialog && (
        <Dialog title="Set Image Size" onClose={() => setSizeDialog(null)} className="max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={event => {
              event.preventDefault()
              applyExactSize()
            }}
          >
            <label className="form-control gap-2">
              <span className="label">Width</span>
              <input
                className="input"
                value={sizeDialog.width}
                onChange={event => {
                  const nextWidth = event.target.value
                  setSizeDialog(current => {
                    if (!current) return current
                    const layer = documentState?.layers.find(item => item.id === current.layerId)
                    if (!layer) return { ...current, width: nextWidth }
                    if (!current.keepAspectRatio) {
                      return { ...current, width: nextWidth }
                    }
                    const width = Number(nextWidth)
                    if (!Number.isFinite(width)) {
                      return { ...current, width: nextWidth }
                    }
                    return {
                      ...current,
                      width: nextWidth,
                      height: String(Math.max(1, Math.round(width / (layer.width / layer.height)))),
                    }
                  })
                }}
              />
            </label>
            <label className="form-control gap-2">
              <span className="label">Height</span>
              <input
                className="input"
                value={sizeDialog.height}
                onChange={event => {
                  const nextHeight = event.target.value
                  setSizeDialog(current => {
                    if (!current) return current
                    const layer = documentState?.layers.find(item => item.id === current.layerId)
                    if (!layer) return { ...current, height: nextHeight }
                    if (!current.keepAspectRatio) {
                      return { ...current, height: nextHeight }
                    }
                    const height = Number(nextHeight)
                    if (!Number.isFinite(height)) {
                      return { ...current, height: nextHeight }
                    }
                    return {
                      ...current,
                      height: nextHeight,
                      width: String(Math.max(1, Math.round(height * (layer.width / layer.height)))),
                    }
                  })
                }}
              />
            </label>
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox"
                checked={sizeDialog.keepAspectRatio}
                onChange={event =>
                  setSizeDialog(current => (current ? { ...current, keepAspectRatio: event.target.checked } : current))
                }
              />
              Keep aspect ratio
            </label>
            <div className="modal-action mt-0">
              <button type="submit" className="btn btn-primary">
                Apply
              </button>
              <button type="button" className="btn" onClick={() => setSizeDialog(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {positionDialog && (
        <Dialog title="Set Image Placement" onClose={() => setPositionDialog(null)} className="max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={event => {
              event.preventDefault()
              applyExactPosition()
            }}
          >
            <p className="text-sm text-base-content/70">Coordinates use the top-left corner of the selected image on the document canvas.</p>
            <label className="form-control gap-2">
              <span className="label">X</span>
              <input
                className="input"
                value={positionDialog.x}
                onChange={event =>
                  setPositionDialog(current => (current ? { ...current, x: event.target.value } : current))
                }
              />
            </label>
            <label className="form-control gap-2">
              <span className="label">Y</span>
              <input
                className="input"
                value={positionDialog.y}
                onChange={event =>
                  setPositionDialog(current => (current ? { ...current, y: event.target.value } : current))
                }
              />
            </label>
            <div className="modal-action mt-0">
              <button type="submit" className="btn btn-primary">
                Apply
              </button>
              <button type="button" className="btn" onClick={() => setPositionDialog(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {errorMessage && (
        <Dialog title="Editor Error" onClose={() => setErrorMessage(null)} className="max-w-md">
          <div className="space-y-4">
            <p className="text-sm text-base-content/70">{errorMessage}</p>
            <div className="modal-action mt-0">
              <button className="btn btn-primary" onClick={() => setErrorMessage(null)}>
                Close
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
