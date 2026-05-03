import { useEffect, useMemo, useRef, useState } from 'react'
import useMeasure from 'react-use-measure'
import {
  EyeIcon,
  FolderOpenIcon,
  ImagePlusIcon,
  MinusIcon,
  MousePointer2Icon,
  PlusIcon,
  Redo2Icon,
  SaveIcon,
  ScanLineIcon,
  Trash2Icon,
  Undo2Icon,
} from 'lucide-react'
import { Button } from '@/lib/components/button'
import { Dialog } from '@/lib/components/dialog'
import { ContextMenu, ContextMenuList, useContextMenu } from '@/lib/components/context-menu'
import { useShortcuts } from '@/lib/hooks/useShortcuts'
import { cn } from '@/lib/functions/clsx'
import { getWindowElectron, windowArgs } from '@/getWindowElectron'
import { RecentEditorProject } from '@common/EditorProject'
import { createLayerFromFile, cutSelectionFromDocument, loadImageElement } from './raster'
import { deserializeProject, serializeProject } from './projectPersistence'
import {
  EditorDocument,
  EditorLayer,
  EditorTool,
  HighlightBrushShape,
  HighlightLayer,
  HistoryEntry,
  ImageLayer,
  NewDocumentPreset,
  PixelSelection,
  ResizeHandle,
  ShapeLayer,
  ShapeType,
} from './types'
import {
  clampShapeOpacity,
  createShapeLayer,
  getShapeRectFromDrag,
  updateShapeLayerRect,
  updateShapeLayerStyle,
  drawShapeLayer,
  ShapeSettingsState,
} from './shapeUtils'
import {
  clampHighlightOpacity,
  clampHighlightBrushSize,
  createHighlightLayer,
  getHighlightAbsolutePoints,
  updateHighlightLayerPoints,
  updateHighlightLayerStyle,
  drawHighlightLayer,
  HighlightSettingsState,
} from './highlightUtils'
import { FormItem } from './form/FormItem'
import { ApplyButton } from './form/ApplyButton'
import { PanelForm } from './form/PanelForm'
import {
  CustomVariableDraft,
  ExpressionVariables,
  parseRoundedMathExpression,
  resolveCustomVariables,
} from '../utils/customVariableUtils'
import {
  LayerPositionDraftState,
  LayerSizeDraftState,
  SelectionDraftState,
  PasteSizeDraftState,
  CanvasDraftState,
} from './editorSession'
import { useToolStore } from './editorSimpleStores'
import { Typescript } from '@common/Typescript'
import { Accordion } from '@/lib/components/accordion'
import { Select } from '@/lib/components/select'
import { InputColor } from '@/lib/components/input-color'
import { Input } from '@/lib/components/input'
import { GridCols } from '@/lib/components/grid-cols'
import { Label } from '@/lib/components/label'

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
      start: Point
    }
  | {
      type: 'creating-highlight'
      initialDocument: EditorDocument
      layerId: string
      start: Point
      axisLock: 'x' | 'y' | null
    }
  | {
      type: 'creating-shape'
      initialDocument: EditorDocument
      layerId: string
      start: Point
    }
  | {
      type: 'moving-selection'
      initialDocument: EditorDocument
      selectionStart: PixelSelection
      pointerStart: Point
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

type ImagePreviewDialogState = {
  layerId: string
  zoom: number
}

type ProjectNameDraftState = {
  value: string
}

type SelectionPreview = {
  floatingDataUrl: string
  selection: PixelSelection
}

type PendingDraftSyncState = {
  layerPosition: LayerPositionDraftState | null
  layerSize: LayerSizeDraftState | null
  selection: SelectionDraftState | null
  pasteSize: PasteSizeDraftState | null
}

type CanvasContextMenuItem =
  | {
      type: 'layer'
      layerId: string
    }
  | {
      type: 'selection'
      layerId: string | null
    }

type EditorSessionState = {
  tool: EditorTool
  canvasDraft: CanvasDraftState
  movementStep: string
  movementStepDraft: string
  pasteSizeDraft: PasteSizeDraftState
  layerPositionDraft: LayerPositionDraftState | null
  layerSizeDraft: LayerSizeDraftState | null
  selectionDraft: SelectionDraftState | null
  variables: CustomVariableDraft[]
  highlightSettings: HighlightSettingsState
  shapeSettings: ShapeSettingsState
}

const DEFAULT_EDITOR_SESSION: EditorSessionState = {
  tool: 'select',
  canvasDraft: { width: '1024', height: '1024' },
  movementStep: '1',
  movementStepDraft: '1',
  pasteSizeDraft: { width: '', height: '' },
  layerPositionDraft: null,
  layerSizeDraft: null,
  selectionDraft: null,
  variables: [],
  highlightSettings: {
    color: '#facc15',
    opacity: 0.35,
    brushShape: 'circle',
    brushSize: 32,
  },
  shapeSettings: {
    shape: 'rectangle',
    fillColor: '#60a5fa',
    borderColor: '#dbeafe',
    borderWidth: 2,
    borderRadius: 16,
    opacity: 0.8,
  },
}

function cloneLayer<T extends EditorLayer>(layer: T): T {
  if (layer.type === 'highlight') {
    return {
      ...layer,
      points: layer.points.map(point => ({ ...point })),
    }
  }

  return { ...layer }
}

function layerDescription(layer: EditorLayer) {
  if (layer.type === 'highlight') return ''
  if (layer.type === 'image') return '[Image]'
  if (layer.type === 'shape') return ''
  Typescript.assertUnreachable(layer)
}

function cloneDocument(documentState: EditorDocument): EditorDocument {
  return {
    ...documentState,
    layers: documentState.layers.map(layer => cloneLayer(layer)),
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

function getActiveLayer(documentState: EditorDocument | null): EditorLayer | null {
  if (!documentState?.activeLayerId) return null
  return documentState.layers.find(layer => layer.id === documentState.activeLayerId) ?? null
}

function updateLayer(
  documentState: EditorDocument,
  layerId: string,
  updater: (layer: EditorLayer) => EditorLayer
): EditorDocument {
  return {
    ...documentState,
    layers: documentState.layers.map(layer => (layer.id === layerId ? updater(layer) : layer)),
  }
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

function getLayerRect(layer: EditorLayer): Rect {
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
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

function hitLayer(layers: EditorLayer[], point: Point): EditorLayer | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    if (!layer.visible) continue
    if (pointInRect(point, getLayerRect(layer))) {
      return layer
    }
  }
  return null
}

function isImageLayer(layer: EditorLayer): layer is ImageLayer {
  return layer.type === 'image'
}

function isHighlightLayer(layer: EditorLayer): layer is HighlightLayer {
  return layer.type === 'highlight'
}

function isShapeLayer(layer: EditorLayer): layer is ShapeLayer {
  return layer.type === 'shape'
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

function clampSelectionToDocument(selection: PixelSelection, documentState: EditorDocument): PixelSelection {
  const x = clamp(Math.round(selection.x), 0, documentState.width - 1)
  const y = clamp(Math.round(selection.y), 0, documentState.height - 1)
  const width = clamp(Math.round(selection.width), 1, documentState.width - x)
  const height = clamp(Math.round(selection.height), 1, documentState.height - y)
  return {
    x,
    y,
    width,
    height,
  }
}

function selectionFromDrag(documentState: EditorDocument, start: Point, current: Point): PixelSelection {
  const normalized = normalizeRect(start, current)
  return clampSelectionToDocument(normalized, documentState)
}

function formatPixels(value: number): string {
  return `${Math.round(value)}`
}

function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

function clampZoom(value: number): number {
  return clamp(Math.round(value * 100) / 100, 0.1, 16)
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
  const [tool, setTool] = useToolStore()
  const [interaction, setInteraction] = useState<InteractionState>(null)
  const [selectionPreview, setSelectionPreview] = useState<SelectionPreview | null>(null)
  const [sizeDialog, setSizeDialog] = useState<SizeDialogState | null>(null)
  const [positionDialog, setPositionDialog] = useState<PositionDialogState | null>(null)
  const [imagePreviewDialog, setImagePreviewDialog] = useState<ImagePreviewDialogState | null>(null)
  const [canvasDraft, setCanvasDraft] = useState<CanvasDraftState>(DEFAULT_EDITOR_SESSION.canvasDraft)
  const [pasteSizeDraft, setPasteSizeDraft] = useState<PasteSizeDraftState>({ width: '', height: '' })
  const [movementStep, setMovementStep] = useState(DEFAULT_EDITOR_SESSION.movementStep)
  const [movementStepDraft, setMovementStepDraft] = useState(DEFAULT_EDITOR_SESSION.movementStep)
  const [customVariables, setCustomVariables] = useState<CustomVariableDraft[]>(DEFAULT_EDITOR_SESSION.variables)
  const [highlightSettings, setHighlightSettings] = useState<HighlightSettingsState>(
    DEFAULT_EDITOR_SESSION.highlightSettings
  )
  const [shapeSettings, setShapeSettings] = useState<ShapeSettingsState>(DEFAULT_EDITOR_SESSION.shapeSettings)
  const [layerPositionDraft, setLayerPositionDraft] = useState<LayerPositionDraftState | null>(null)
  const [layerSizeDraft, setLayerSizeDraft] = useState<LayerSizeDraftState | null>(null)
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraftState | null>(null)
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
  const pendingDraftSyncRef = useRef<PendingDraftSyncState>({
    layerPosition: null,
    layerSize: null,
    selection: null,
    pasteSize: null,
  })
  const [imageRevision, setImageRevision] = useState(0)

  const activeLayer = useMemo(() => getActiveLayer(documentState), [documentState])
  const activeHighlight = activeLayer && isHighlightLayer(activeLayer) ? activeLayer : null
  const activeShape = activeLayer && isShapeLayer(activeLayer) ? activeLayer : null
  const canvasExpressionVariables = useMemo<ExpressionVariables>(
    () => ({
      canvasWidth: documentState?.width ?? 0,
      canvasHeight: documentState?.height ?? 0,
    }),
    [documentState?.height, documentState?.width]
  )
  const resolvedCustomVariables = useMemo(
    () => resolveCustomVariables(customVariables, canvasExpressionVariables),
    [canvasExpressionVariables, customVariables]
  )
  const resolvedExpressionVariables = resolvedCustomVariables.variables
  const activeLayerExpressionVariables = useMemo<ExpressionVariables>(
    () => ({
      ...resolvedExpressionVariables,
      imageX: activeLayer?.x ?? 0,
      imageY: activeLayer?.y ?? 0,
      imageWidth: activeLayer?.width ?? 0,
      imageHeight: activeLayer?.height ?? 0,
    }),
    [activeLayer, resolvedExpressionVariables]
  )
  const selectionExpressionVariables = useMemo<ExpressionVariables>(
    () => ({
      ...resolvedExpressionVariables,
      selectionX: documentState?.selection?.x ?? 0,
      selectionY: documentState?.selection?.y ?? 0,
      selectionWidth: documentState?.selection?.width ?? 0,
      selectionHeight: documentState?.selection?.height ?? 0,
    }),
    [documentState?.selection, resolvedExpressionVariables]
  )

  function applyProjectState(args: {
    nextProjectPath: string | null
    nextProjectName: string
    nextDocumentState: EditorDocument | null
    nextHistory: { past: HistoryEntry[]; future: HistoryEntry[] }
    nextTool: EditorTool
    nextCanvasDraft: CanvasDraftState
    nextMovementStep: string
    nextMovementStepDraft: string
    nextPasteSizeDraft: PasteSizeDraftState
    nextLayerPositionDraft: LayerPositionDraftState | null
    nextLayerSizeDraft: LayerSizeDraftState | null
    nextSelectionDraft: SelectionDraftState | null
    nextVariables: CustomVariableDraft[]
    nextHighlightSettings: HighlightSettingsState
    nextShapeSettings: ShapeSettingsState
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
    setMovementStepDraft(args.nextMovementStepDraft)
    setCustomVariables(args.nextVariables)
    setHighlightSettings(args.nextHighlightSettings)
    setShapeSettings(args.nextShapeSettings)
    pendingDraftSyncRef.current = {
      layerPosition: args.nextLayerPositionDraft,
      layerSize: args.nextLayerSizeDraft,
      selection: args.nextSelectionDraft,
      pasteSize: args.nextPasteSizeDraft,
    }
    setInteraction(null)
    setSelectionPreview(null)
    setImagePreviewDialog(null)
    setLayerPositionDraft(args.nextLayerPositionDraft)
    setLayerSizeDraft(args.nextLayerSizeDraft)
    setSelectionDraft(args.nextSelectionDraft)
    setPasteSizeDraft(args.nextPasteSizeDraft)
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
        nextMovementStepDraft: loadedProject.ui.movementStepDraft,
        nextPasteSizeDraft: loadedProject.ui.pasteSizeDraft,
        nextLayerPositionDraft: loadedProject.ui.layerPositionDraft,
        nextLayerSizeDraft: loadedProject.ui.layerSizeDraft,
        nextSelectionDraft: loadedProject.ui.selectionDraft,
        nextVariables: loadedProject.ui.variables,
        nextHighlightSettings: loadedProject.ui.highlightSettings,
        nextShapeSettings: loadedProject.ui.shapeSettings,
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
          movementStepDraft,
          pasteSizeDraft,
          layerPositionDraft,
          layerSizeDraft,
          selectionDraft,
          variables: customVariables,
          highlightSettings,
          shapeSettings,
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
          movementStepDraft,
          pasteSizeDraft,
          layerPositionDraft,
          layerSizeDraft,
          selectionDraft,
          variables: customVariables,
          highlightSettings,
          shapeSettings,
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
        nextMovementStepDraft: loadedProject.ui.movementStepDraft,
        nextPasteSizeDraft: loadedProject.ui.pasteSizeDraft,
        nextLayerPositionDraft: loadedProject.ui.layerPositionDraft,
        nextLayerSizeDraft: loadedProject.ui.layerSizeDraft,
        nextSelectionDraft: loadedProject.ui.selectionDraft,
        nextVariables: loadedProject.ui.variables,
        nextHighlightSettings: loadedProject.ui.highlightSettings,
        nextShapeSettings: loadedProject.ui.shapeSettings,
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
      nextMovementStepDraft: DEFAULT_EDITOR_SESSION.movementStepDraft,
      nextPasteSizeDraft: DEFAULT_EDITOR_SESSION.pasteSizeDraft,
      nextLayerPositionDraft: DEFAULT_EDITOR_SESSION.layerPositionDraft,
      nextLayerSizeDraft: DEFAULT_EDITOR_SESSION.layerSizeDraft,
      nextSelectionDraft: DEFAULT_EDITOR_SESSION.selectionDraft,
      nextVariables: DEFAULT_EDITOR_SESSION.variables,
      nextHighlightSettings: DEFAULT_EDITOR_SESSION.highlightSettings,
      nextShapeSettings: DEFAULT_EDITOR_SESSION.shapeSettings,
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
    const movementStepVariables = documentState
      ? resolveCustomVariables(customVariables, {
          canvasWidth: documentState.width,
          canvasHeight: documentState.height,
        }).variables
      : resolvedExpressionVariables
    const parsedMovementStep = parseRoundedMathExpression(movementStepDraft, movementStepVariables)
    const nextMovementStep = Math.max(1, parsedMovementStep ?? Number.NaN)
    if (!Number.isFinite(nextMovementStep)) {
      setErrorMessage('Movement step must be a valid number or math expression')
      return
    }
    setMovementStep(String(nextMovementStep))
  }

  function addCustomVariable() {
    setCustomVariables(current => [...current, { id: crypto.randomUUID(), name: '', expression: '' }])
  }

  function updateCustomVariable(variableId: string, changes: Partial<CustomVariableDraft>) {
    setCustomVariables(current =>
      current.map(variable => (variable.id === variableId ? { ...variable, ...changes } : variable))
    )
  }

  function removeCustomVariable(variableId: string) {
    setCustomVariables(current => current.filter(variable => variable.id !== variableId))
  }

  function applyCustomVariables() {
    if (Object.keys(resolvedCustomVariables.errors).length > 0) {
      setErrorMessage('Fix variable errors before applying them')
      return
    }

    let nextDocument = documentState ? cloneDocument(documentState) : null
    let didDocumentChange = false

    if (nextDocument) {
      const nextCanvasVariables = resolveCustomVariables(customVariables, {
        canvasWidth: nextDocument.width,
        canvasHeight: nextDocument.height,
      }).variables
      const nextWidth = parseRoundedMathExpression(canvasDraft.width, nextCanvasVariables)
      const nextHeight = parseRoundedMathExpression(canvasDraft.height, nextCanvasVariables)
      if (nextWidth !== null && nextHeight !== null && Number.isFinite(nextWidth) && Number.isFinite(nextHeight)) {
        const width = Math.max(1, nextWidth)
        const height = Math.max(1, nextHeight)
        if (width !== nextDocument.width || height !== nextDocument.height) {
          nextDocument.width = width
          nextDocument.height = height
          didDocumentChange = true
        }
      }

      const resolvedVariables = resolveCustomVariables(customVariables, {
        canvasWidth: nextDocument.width,
        canvasHeight: nextDocument.height,
      }).variables

      const parsedPasteWidth = pasteSizeDraft.width.trim().length
        ? parseRoundedMathExpression(pasteSizeDraft.width, resolvedVariables)
        : null
      const parsedPasteHeight = pasteSizeDraft.height.trim().length
        ? parseRoundedMathExpression(pasteSizeDraft.height, resolvedVariables)
        : null
      const nextPasteWidth = parsedPasteWidth === null ? null : Math.max(1, parsedPasteWidth)
      const nextPasteHeight = parsedPasteHeight === null ? null : Math.max(1, parsedPasteHeight)
      if (nextPasteWidth !== nextDocument.pasteWidth || nextPasteHeight !== nextDocument.pasteHeight) {
        nextDocument.pasteWidth = nextPasteWidth
        nextDocument.pasteHeight = nextPasteHeight
        didDocumentChange = true
      }

      if (layerPositionDraft) {
        const layer = nextDocument.layers.find(item => item.id === layerPositionDraft.layerId)
        if (layer) {
          const layerVariables = {
            ...resolvedVariables,
            imageX: layer.x,
            imageY: layer.y,
            imageWidth: layer.width,
            imageHeight: layer.height,
          }
          const parsedX = parseRoundedMathExpression(layerPositionDraft.x, layerVariables)
          const parsedY = parseRoundedMathExpression(layerPositionDraft.y, layerVariables)
          const nextX = snapToStep(parsedX ?? Number.NaN, normalizedMovementStep)
          const nextY = snapToStep(parsedY ?? Number.NaN, normalizedMovementStep)
          if (Number.isFinite(nextX) && Number.isFinite(nextY) && (nextX !== layer.x || nextY !== layer.y)) {
            layer.x = nextX
            layer.y = nextY
            didDocumentChange = true
          }
        }
      }

      if (layerSizeDraft) {
        const layer = nextDocument.layers.find(item => item.id === layerSizeDraft.layerId)
        if (layer && !isHighlightLayer(layer)) {
          const layerVariables = {
            ...resolvedVariables,
            imageX: layer.x,
            imageY: layer.y,
            imageWidth: layer.width,
            imageHeight: layer.height,
          }
          let nextWidth = Math.max(1, parseRoundedMathExpression(layerSizeDraft.width, layerVariables) ?? Number.NaN)
          let nextHeight = Math.max(1, parseRoundedMathExpression(layerSizeDraft.height, layerVariables) ?? Number.NaN)
          if (
            isShapeLayer(layer) &&
            layer.shape === 'circle' &&
            Number.isFinite(nextWidth) &&
            Number.isFinite(nextHeight)
          ) {
            const size = Math.max(nextWidth, nextHeight)
            nextWidth = size
            nextHeight = size
          }
          if (
            Number.isFinite(nextWidth) &&
            Number.isFinite(nextHeight) &&
            (nextWidth !== layer.width || nextHeight !== layer.height)
          ) {
            layer.width = nextWidth
            layer.height = nextHeight
            didDocumentChange = true
          }
        }
      }

      if (nextDocument.selection && selectionDraft) {
        const selectionVariables = {
          ...resolvedVariables,
          selectionX: nextDocument.selection.x,
          selectionY: nextDocument.selection.y,
          selectionWidth: nextDocument.selection.width,
          selectionHeight: nextDocument.selection.height,
        }
        const nextSelection = clampSelectionToDocument(
          {
            x: parseRoundedMathExpression(selectionDraft.x, selectionVariables) ?? nextDocument.selection.x,
            y: parseRoundedMathExpression(selectionDraft.y, selectionVariables) ?? nextDocument.selection.y,
            width: Math.max(
              1,
              parseRoundedMathExpression(selectionDraft.width, selectionVariables) ?? nextDocument.selection.width
            ),
            height: Math.max(
              1,
              parseRoundedMathExpression(selectionDraft.height, selectionVariables) ?? nextDocument.selection.height
            ),
          },
          nextDocument
        )

        if (JSON.stringify(nextSelection) !== JSON.stringify(nextDocument.selection)) {
          nextDocument.selection = nextSelection
          didDocumentChange = true
        }
      } else if (nextDocument.selection) {
        const clampedSelection = clampSelectionToDocument(nextDocument.selection, nextDocument)
        if (JSON.stringify(clampedSelection) !== JSON.stringify(nextDocument.selection)) {
          nextDocument.selection = clampedSelection
          didDocumentChange = true
        }
      }
    }

    const parsedMovementStep = parseRoundedMathExpression(movementStepDraft, resolvedExpressionVariables)
    const nextMovementStep = parsedMovementStep === null ? null : Math.max(1, parsedMovementStep)
    const didMovementStepChange = nextMovementStep !== null && String(nextMovementStep) !== movementStep

    pendingDraftSyncRef.current = {
      layerPosition: layerPositionDraft,
      layerSize: layerSizeDraft,
      selection: selectionDraft,
      pasteSize: pasteSizeDraft,
    }

    if (didMovementStepChange) {
      setMovementStep(String(nextMovementStep))
    }
    if (documentState && nextDocument && didDocumentChange) {
      pushHistory('Apply variables', documentState, nextDocument)
    }
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
      const pendingDraft = pendingDraftSyncRef.current.layerPosition
      if (pendingDraft?.layerId === activeLayer.id) {
        pendingDraftSyncRef.current.layerPosition = null
        return pendingDraft
      }

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
      if (isHighlightLayer(activeLayer)) {
        return null
      }

      const pendingDraft = pendingDraftSyncRef.current.layerSize
      if (pendingDraft?.layerId === activeLayer.id) {
        pendingDraftSyncRef.current.layerSize = null
        return pendingDraft
      }

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
    if (!documentState?.selection) {
      setSelectionDraft(null)
      return
    }

    const selection = documentState.selection

    setSelectionDraft(current => {
      const pendingDraft = pendingDraftSyncRef.current.selection
      if (pendingDraft) {
        pendingDraftSyncRef.current.selection = null
        return pendingDraft
      }

      const nextDraft = {
        x: String(Math.round(selection.x)),
        y: String(Math.round(selection.y)),
        width: String(Math.round(selection.width)),
        height: String(Math.round(selection.height)),
      }

      if (
        current &&
        current.x === nextDraft.x &&
        current.y === nextDraft.y &&
        current.width === nextDraft.width &&
        current.height === nextDraft.height
      ) {
        return current
      }

      return nextDraft
    })
  }, [documentState?.selection])

  useEffect(() => {
    if (!documentState) return

    const pendingDraft = pendingDraftSyncRef.current.pasteSize
    if (pendingDraft) {
      pendingDraftSyncRef.current.pasteSize = null
      setPasteSizeDraft(pendingDraft)
      return
    }

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
  }, [
    canvasDraft,
    customVariables,
    documentState,
    highlightSettings,
    history,
    interaction,
    movementStep,
    projectName,
    projectPath,
    shapeSettings,
    tool,
  ])

  const normalizedMovementStep = useMemo(
    () => Math.max(1, parseRoundedMathExpression(movementStep, resolvedExpressionVariables) ?? 1),
    [movementStep, resolvedExpressionVariables]
  )
  const normalizedMovementStepDraft = useMemo(
    () => Math.max(1, parseRoundedMathExpression(movementStepDraft, resolvedExpressionVariables) ?? 1),
    [movementStepDraft, resolvedExpressionVariables]
  )

  const viewportScale = useMemo(() => {
    if (!documentState) return 1
    if (!viewportBounds.width || !viewportBounds.height) return 1
    return Math.max(
      0.05,
      Math.min(
        (viewportBounds.width - 48) / documentState.width,
        (viewportBounds.height - 48) / documentState.height,
        1
      )
    )
  }, [documentState, viewportBounds.height, viewportBounds.width])

  useEffect(() => {
    if (!documentState) return
    let cancelled = false
    const currentDocumentState = documentState

    async function ensureImages() {
      const urls = new Set(currentDocumentState.layers.filter(isImageLayer).map(layer => layer.dataUrl))
      if (selectionPreview) {
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
      if (isHighlightLayer(layer)) {
        drawHighlightLayer(mainContext, layer)
        continue
      }
      if (isShapeLayer(layer)) {
        drawShapeLayer(mainContext, layer)
        continue
      }
      const image = imageCacheRef.current.get(layer.dataUrl)
      if (!image) continue
      mainContext.save()
      mainContext.globalAlpha = layer.opacity
      mainContext.imageSmoothingEnabled = true
      mainContext.drawImage(image, layer.x, layer.y, layer.width, layer.height)
      mainContext.restore()
    }

    if (selectionPreview) {
      const floatingImage = imageCacheRef.current.get(selectionPreview.floatingDataUrl)
      if (floatingImage) {
        const rect = selectionPreview.selection
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

      if (tool === 'select' && isImageLayer(activeLayer)) {
        for (const { rect } of getHandles(activeLayer)) {
          overlayContext.fillStyle = '#f7f8fb'
          overlayContext.strokeStyle = '#245cff'
          overlayContext.lineWidth = 1
          overlayContext.fillRect(rect.x, rect.y, rect.width, rect.height)
          overlayContext.strokeRect(rect.x, rect.y, rect.width, rect.height)
        }
      }
    }

    if (documentState.selection) {
      const selectionRect = documentState.selection
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
    const parsedWidth = hasWidth ? parseRoundedMathExpression(widthValue, resolvedExpressionVariables) : null
    const parsedHeight = hasHeight ? parseRoundedMathExpression(heightValue, resolvedExpressionVariables) : null
    const pasteWidth = parsedWidth === null ? null : Math.max(1, parsedWidth)
    const pasteHeight = parsedHeight === null ? null : Math.max(1, parsedHeight)
    if ((hasWidth && pasteWidth === null) || (hasHeight && pasteHeight === null)) {
      setErrorMessage('Paste width and height must be valid numbers or simple math expressions when provided')
      return
    }
    if ((hasWidth && !Number.isFinite(pasteWidth)) || (hasHeight && !Number.isFinite(pasteHeight))) {
      setErrorMessage('Paste width and height must be valid numbers or simple math expressions when provided')
      return
    }

    pendingDraftSyncRef.current.pasteSize = { width: widthValue, height: heightValue }
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
      selection: documentState.selection,
    }

    pushHistory('Delete object', documentState, nextDocument)
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
        future: [
          { label: previousEntry.label, document: cloneDocument(currentDocumentState) },
          ...currentHistory.future,
        ],
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
    documentState?.selection && {
      code: [
        { code: 'KeyC', metaKey: true },
        { code: 'KeyC', ctrlKey: true },
      ],
      handler: event => {
        event?.preventDefault()
        void copySelectionToClipboard()
      },
      label: '[Editor] Copy selection',
    },
    activeLayer && {
      code: ['Backspace', 'Delete'],
      handler: event => {
        event?.preventDefault()
        deleteLayer(activeLayer.id)
      },
      label: '[Editor] Delete selected object',
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

  async function startSelectionMove(selection: PixelSelection, pointer: Point) {
    if (!documentState) return
    const currentDocument = cloneDocument(documentState)
    const draft = await cutSelectionFromDocument(currentDocument, selection)
    setDocumentState({
      ...currentDocument,
      layers: draft.layers,
      selection,
    })
    setSelectionPreview({
      floatingDataUrl: draft.floatingDataUrl,
      selection,
    })
    setInteraction({
      type: 'moving-selection',
      initialDocument: cloneDocument(documentState),
      selectionStart: selection,
      pointerStart: pointer,
      floatingDataUrl: draft.floatingDataUrl,
    })
  }

  function beginLayerMove(layer: EditorLayer, pointer: Point) {
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

  function beginHighlightCreation(pointer: Point) {
    console.log('[Highlight] beginHighlightCreation - start point:', pointer)
    if (!documentState) return
    const layer = createHighlightLayer([pointer], highlightSettings)
    setDocumentState({
      ...documentState,
      layers: [...documentState.layers, layer],
      activeLayerId: layer.id,
      selection: null,
    })
    setInteraction({
      type: 'creating-highlight',
      initialDocument: cloneDocument(documentState),
      layerId: layer.id,
      start: pointer,
      axisLock: null,
    })
  }

  function beginShapeCreation(pointer: Point) {
    if (!documentState) return
    const layer = createShapeLayer({ x: pointer.x, y: pointer.y, width: 1, height: 1 }, shapeSettings)
    setDocumentState({
      ...documentState,
      layers: [...documentState.layers, layer],
      activeLayerId: layer.id,
      selection: null,
    })
    setInteraction({
      type: 'creating-shape',
      initialDocument: cloneDocument(documentState),
      layerId: layer.id,
      start: pointer,
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
    const selection = selectionFromDrag(documentState, interaction.start, pointer)
    setDocumentState({ ...documentState, selection })
  }

  function updateHighlightCreation(pointer: Point, constrainAxis: boolean) {
    if (!interaction || interaction.type !== 'creating-highlight' || !documentState) return

    const layer = documentState.layers.find(l => l.id === interaction.layerId)
    if (!layer || !isHighlightLayer(layer)) return

    const absolutePoints = getHighlightAbsolutePoints(layer)
    const lastPoint = absolutePoints[absolutePoints.length - 1]

    console.log(
      '[Highlight] update - constrainAxis:',
      constrainAxis,
      'axisLock:',
      interaction.axisLock,
      'lastPoint:',
      lastPoint,
      'pointer:',
      pointer
    )

    let constrainedPointer = pointer
    let nextAxisLock = interaction.axisLock

    if (!constrainAxis) {
      nextAxisLock = null
    } else if (lastPoint) {
      if (interaction.axisLock === null) {
        const deltaX = Math.abs(pointer.x - lastPoint.x)
        const deltaY = Math.abs(pointer.y - lastPoint.y)
        nextAxisLock = deltaX >= deltaY ? 'x' : 'y'
        console.log('[Highlight] locking axis:', nextAxisLock, 'deltaX:', deltaX, 'deltaY:', deltaY)
      }
      console.log('[Highlight] using locked axis:', nextAxisLock)
      if (nextAxisLock === 'x') {
        constrainedPointer = { x: pointer.x, y: lastPoint.y }
      } else {
        constrainedPointer = { x: lastPoint.x, y: pointer.y }
      }
    }

    if (
      lastPoint &&
      Math.round(lastPoint.x) === Math.round(constrainedPointer.x) &&
      Math.round(lastPoint.y) === Math.round(constrainedPointer.y)
    ) {
      return
    }

    setDocumentState(
      updateLayer(documentState, interaction.layerId, layer => {
        if (!isHighlightLayer(layer)) return layer
        return updateHighlightLayerPoints(layer, [...getHighlightAbsolutePoints(layer), constrainedPointer])
      })
    )
    if (interaction.axisLock !== nextAxisLock) {
      setInteraction({ ...interaction, axisLock: nextAxisLock })
    }
  }

  function updateShapeCreation(pointer: Point) {
    if (!interaction || interaction.type !== 'creating-shape' || !documentState) return
    const rect = getShapeRectFromDrag(shapeSettings, interaction.start, pointer)
    setDocumentState(
      updateLayer(documentState, interaction.layerId, layer => {
        if (!isShapeLayer(layer)) return layer
        return updateShapeLayerRect(layer, rect)
      })
    )
  }

  function updateSelectionMove(pointer: Point) {
    if (!interaction || interaction.type !== 'moving-selection' || !documentState || !selectionPreview) return
    const deltaDocumentX = Math.round(pointer.x - interaction.pointerStart.x)
    const deltaDocumentY = Math.round(pointer.y - interaction.pointerStart.y)
    const maxX = documentState.width - interaction.selectionStart.width
    const maxY = documentState.height - interaction.selectionStart.height

    const selection = {
      ...interaction.selectionStart,
      x: clamp(interaction.selectionStart.x + deltaDocumentX, 0, Math.max(0, maxX)),
      y: clamp(interaction.selectionStart.y + deltaDocumentY, 0, Math.max(0, maxY)),
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
      documentState.selection.y === interaction.selectionStart.y &&
      documentState.selection.width === interaction.selectionStart.width &&
      documentState.selection.height === interaction.selectionStart.height
    ) {
      setDocumentState(cloneDocument(interaction.initialDocument))
      setSelectionPreview(null)
      setInteraction(null)
      return
    }
    const nextLayer: ImageLayer = {
      id: crypto.randomUUID(),
      type: 'image',
      name: 'Selection',
      visible: true,
      opacity: 1,
      x: documentState.selection.x,
      y: documentState.selection.y,
      width: documentState.selection.width,
      height: documentState.selection.height,
      pixelWidth: interaction.selectionStart.width,
      pixelHeight: interaction.selectionStart.height,
      dataUrl: interaction.floatingDataUrl,
    }

    const nextDocument: EditorDocument = {
      ...documentState,
      layers: [...documentState.layers, nextLayer],
      activeLayerId: nextLayer.id,
      selection: documentState.selection,
    }

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
        if (isImageLayer(layer)) {
          const handle = findHandle(layer, pointer)
          if (handle) {
            beginResize(layer, pointer, handle)
            return
          }
        }
        beginLayerMove(layer, pointer)
        return
      }
      setDocumentState({ ...documentState, activeLayerId: null, selection: null })
      return
    }

    if (tool === 'marquee') {
      const currentSelection = documentState.selection
      if (currentSelection && pointInRect(pointer, currentSelection)) {
        await startSelectionMove(currentSelection, pointer)
        return
      }

      setDocumentState({ ...documentState, activeLayerId: layer?.id ?? documentState.activeLayerId, selection: null })
      setInteraction({
        type: 'creating-selection',
        initialDocument: cloneDocument(documentState),
        start: pointer,
      })
      return
    }

    if (tool === 'highlight') {
      beginHighlightCreation(pointer)
      return
    }

    if (tool === 'shape') {
      beginShapeCreation(pointer)
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
    if (interaction.type === 'creating-highlight') {
      console.log('[Highlight] pointerMove - shiftKey:', event.shiftKey, 'pointer:', pointer)
      updateHighlightCreation(pointer, event.shiftKey)
      return
    }
    if (interaction.type === 'creating-shape') {
      updateShapeCreation(pointer)
      return
    }
    if (interaction.type === 'moving-selection') {
      updateSelectionMove(pointer)
    }
  }

  async function handleCanvasPointerUp() {
    if (!interaction || !documentState) return
    if (interaction.type === 'moving-layer') {
      const layer = documentState.layers.find(item => item.id === interaction.layerId)
      finalizeInteraction(
        layer?.type === 'highlight' ? 'Move highlight' : layer?.type === 'shape' ? 'Move shape' : 'Move image'
      )
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
    if (interaction.type === 'creating-highlight') {
      finalizeInteraction('Create highlight')
      return
    }
    if (interaction.type === 'creating-shape') {
      finalizeInteraction('Create shape')
      return
    }
    if (interaction.type === 'moving-selection') {
      await finishSelectionMove()
    }
  }

  function handleCanvasPointerCancel() {
    cancelInteraction()
  }

  function openSizeDialog(layerId: string) {
    const layer = documentState?.layers.find(item => item.id === layerId)
    if (!layer || isHighlightLayer(layer)) return
    setSizeDialog({
      layerId,
      width: String(Math.round(layer.width)),
      height: String(Math.round(layer.height)),
      keepAspectRatio: isImageLayer(layer),
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

  function openImagePreviewDialog(layerId: string) {
    const layer = documentState?.layers.find(item => item.id === layerId)
    if (!layer || !isImageLayer(layer)) return
    setImagePreviewDialog({
      layerId,
      zoom: 1,
    })
  }

  function applyExactSize() {
    if (!documentState || !sizeDialog) return
    const layer = documentState.layers.find(item => item.id === sizeDialog.layerId)
    if (!layer || isHighlightLayer(layer)) return

    const sizeDialogVariables: ExpressionVariables = {
      ...resolvedExpressionVariables,
      imageX: layer.x,
      imageY: layer.y,
      imageWidth: layer.width,
      imageHeight: layer.height,
    }
    let width = Math.max(1, parseRoundedMathExpression(sizeDialog.width, sizeDialogVariables) ?? Number.NaN)
    let height = Math.max(1, parseRoundedMathExpression(sizeDialog.height, sizeDialogVariables) ?? Number.NaN)
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setErrorMessage('Width and height must be valid numbers or simple math expressions')
      return
    }

    if (isShapeLayer(layer) && layer.shape === 'circle') {
      const size = Math.max(width, height)
      width = size
      height = size
    } else if (sizeDialog.keepAspectRatio && isImageLayer(layer)) {
      const ratio = layer.width / layer.height
      if (parseRoundedMathExpression(sizeDialog.width, sizeDialogVariables) !== Math.round(layer.width)) {
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

    const positionDialogVariables: ExpressionVariables = {
      ...resolvedExpressionVariables,
      imageX: layer.x,
      imageY: layer.y,
      imageWidth: layer.width,
      imageHeight: layer.height,
    }
    const parsedX = parseRoundedMathExpression(positionDialog.x, positionDialogVariables)
    const parsedY = parseRoundedMathExpression(positionDialog.y, positionDialogVariables)
    const x = snapToStep(parsedX ?? Number.NaN, normalizedMovementStep)
    const y = snapToStep(parsedY ?? Number.NaN, normalizedMovementStep)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setErrorMessage('Position coordinates must be valid numbers or simple math expressions')
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

    const parsedX = parseRoundedMathExpression(layerPositionDraft.x, activeLayerExpressionVariables)
    const parsedY = parseRoundedMathExpression(layerPositionDraft.y, activeLayerExpressionVariables)
    const x = snapToStep(parsedX ?? Number.NaN, normalizedMovementStep)
    const y = snapToStep(parsedY ?? Number.NaN, normalizedMovementStep)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setErrorMessage('Position coordinates must be valid numbers or simple math expressions')
      return
    }

    const nextDocument = updateLayer(documentState, activeLayer.id, layer => ({
      ...layer,
      x,
      y,
    }))

    pendingDraftSyncRef.current.layerPosition = layerPositionDraft
    pushHistory('Set exact position', documentState, nextDocument)
  }

  function applyInspectorSize() {
    if (!documentState || !activeLayer || !layerSizeDraft || layerSizeDraft.layerId !== activeLayer.id) return
    if (isHighlightLayer(activeLayer)) return

    let width = Math.max(
      1,
      parseRoundedMathExpression(layerSizeDraft.width, activeLayerExpressionVariables) ?? Number.NaN
    )
    let height = Math.max(
      1,
      parseRoundedMathExpression(layerSizeDraft.height, activeLayerExpressionVariables) ?? Number.NaN
    )
    if (
      isShapeLayer(activeLayer) &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      activeLayer.shape === 'circle'
    ) {
      const size = Math.max(width, height)
      width = size
      height = size
    }
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setErrorMessage('Width and height must be valid numbers or simple math expressions')
      return
    }

    const nextDocument = updateLayer(documentState, activeLayer.id, layer => ({
      ...layer,
      width,
      height,
    }))

    pendingDraftSyncRef.current.layerSize = layerSizeDraft
    pushHistory('Set exact size', documentState, nextDocument)
  }

  function applyActiveHighlightStyle(
    changes: Partial<Pick<HighlightLayer, 'color' | 'opacity' | 'brushShape' | 'brushSize'>>
  ) {
    if (!documentState || !activeHighlight) return
    const nextDocument = updateLayer(documentState, activeHighlight.id, layer => {
      if (!isHighlightLayer(layer)) return layer
      return updateHighlightLayerStyle(layer, changes)
    })
    if (documentsEqual(documentState, nextDocument)) return
    pushHistory('Update highlight', documentState, nextDocument)
  }

  function applyActiveShapeStyle(
    changes: Partial<
      Pick<
        ShapeLayer,
        'shape' | 'fillColor' | 'borderColor' | 'borderRadius' | 'opacity' | 'width' | 'height' | 'borderWidth'
      >
    >
  ) {
    if (!documentState || !activeShape) return
    const nextDocument = updateLayer(documentState, activeShape.id, layer => {
      if (!isShapeLayer(layer)) return layer
      return updateShapeLayerStyle(layer, changes)
    })
    if (documentsEqual(documentState, nextDocument)) return
    pushHistory('Update shape', documentState, nextDocument)
  }

  function applySelectionPosition() {
    if (!documentState || !documentState.selection || !selectionDraft) return

    const x = parseRoundedMathExpression(selectionDraft.x, selectionExpressionVariables) ?? Number.NaN
    const y = parseRoundedMathExpression(selectionDraft.y, selectionExpressionVariables) ?? Number.NaN
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setErrorMessage('Selection coordinates must be valid numbers or simple math expressions')
      return
    }

    const nextSelection = clampSelectionToDocument(
      {
        ...documentState.selection,
        x,
        y,
      },
      documentState
    )

    pendingDraftSyncRef.current.selection = selectionDraft
    pushHistory('Set selection position', documentState, {
      ...documentState,
      selection: nextSelection,
    })
  }

  function applySelectionSize() {
    if (!documentState || !documentState.selection || !selectionDraft) return

    const width = Math.max(
      1,
      parseRoundedMathExpression(selectionDraft.width, selectionExpressionVariables) ?? Number.NaN
    )
    const height = Math.max(
      1,
      parseRoundedMathExpression(selectionDraft.height, selectionExpressionVariables) ?? Number.NaN
    )
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setErrorMessage('Selection width and height must be valid numbers or simple math expressions')
      return
    }

    const nextSelection = clampSelectionToDocument(
      {
        ...documentState.selection,
        width,
        height,
      },
      documentState
    )

    pendingDraftSyncRef.current.selection = selectionDraft
    pushHistory('Set selection size', documentState, {
      ...documentState,
      selection: nextSelection,
    })
  }

  async function copySelectionToClipboard() {
    if (!documentState?.selection || !mainCanvasRef.current) return
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setErrorMessage('Image clipboard copy is not available in this environment')
      return
    }

    try {
      const selection = documentState.selection
      const clipboardCanvas = document.createElement('canvas')
      clipboardCanvas.width = selection.width
      clipboardCanvas.height = selection.height
      const context = clipboardCanvas.getContext('2d')
      if (!context) {
        throw new Error('Could not create clipboard canvas')
      }

      context.drawImage(
        mainCanvasRef.current,
        selection.x,
        selection.y,
        selection.width,
        selection.height,
        0,
        0,
        selection.width,
        selection.height
      )

      const blob = await new Promise<Blob | null>(resolve => clipboardCanvas.toBlob(resolve, 'image/png'))
      if (!blob) {
        throw new Error('Could not create clipboard image')
      }

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to copy selection to clipboard')
    }
  }

  async function saveSelectionImage() {
    if (!documentState?.selection || !mainCanvasRef.current || isSaving) return

    try {
      setIsSaving(true)
      const selection = documentState.selection
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = selection.width
      exportCanvas.height = selection.height
      const context = exportCanvas.getContext('2d')
      if (!context) {
        throw new Error('Could not create selection export canvas')
      }

      context.drawImage(
        mainCanvasRef.current,
        selection.x,
        selection.y,
        selection.width,
        selection.height,
        0,
        0,
        selection.width,
        selection.height
      )

      const dataUrl = exportCanvas.toDataURL('image/png')
      const defaultFileName = `kopa-selection-${selection.width}x${selection.height}.png`
      await getWindowElectron().saveFinalImage({ dataUrl, defaultFileName })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save selection image')
    } finally {
      setIsSaving(false)
    }
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
    snapToStep(
      parseRoundedMathExpression(layerPositionDraft.x, activeLayerExpressionVariables) ?? Number.NaN,
      normalizedMovementStep
    ) === Math.round(activeLayer.x) &&
    snapToStep(
      parseRoundedMathExpression(layerPositionDraft.y, activeLayerExpressionVariables) ?? Number.NaN,
      normalizedMovementStep
    ) === Math.round(activeLayer.y)

  const isInspectorSizeUnchanged =
    !!activeLayer &&
    !!layerSizeDraft &&
    layerSizeDraft.layerId === activeLayer.id &&
    parseRoundedMathExpression(layerSizeDraft.width, activeLayerExpressionVariables) ===
      Math.round(activeLayer.width) &&
    parseRoundedMathExpression(layerSizeDraft.height, activeLayerExpressionVariables) === Math.round(activeLayer.height)

  const isSelectionPositionUnchanged =
    !!documentState?.selection &&
    !!selectionDraft &&
    parseRoundedMathExpression(selectionDraft.x, selectionExpressionVariables) ===
      Math.round(documentState.selection.x) &&
    parseRoundedMathExpression(selectionDraft.y, selectionExpressionVariables) === Math.round(documentState.selection.y)

  const isSelectionSizeUnchanged =
    !!documentState?.selection &&
    !!selectionDraft &&
    parseRoundedMathExpression(selectionDraft.width, selectionExpressionVariables) ===
      Math.round(documentState.selection.width) &&
    parseRoundedMathExpression(selectionDraft.height, selectionExpressionVariables) ===
      Math.round(documentState.selection.height)

  function applyCanvasDraft() {
    const width = Math.max(1, parseRoundedMathExpression(canvasDraft.width, resolvedExpressionVariables) ?? Number.NaN)
    const height = Math.max(
      1,
      parseRoundedMathExpression(canvasDraft.height, resolvedExpressionVariables) ?? Number.NaN
    )
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setErrorMessage('Canvas size must be valid numbers or simple math expressions')
      return
    }
    setCanvasSize(width, height)
  }

  const layerMenu = useContextMenu<CanvasContextMenuItem>()
  const selectionContextLayerId = layerMenu.item?.type === 'selection' ? layerMenu.item.layerId : null
  const contextLayerId = layerMenu.item?.type === 'layer' ? layerMenu.item.layerId : selectionContextLayerId
  const contextLayer =
    contextLayerId && documentState ? (documentState.layers.find(layer => layer.id === contextLayerId) ?? null) : null
  const previewLayer =
    imagePreviewDialog && documentState
      ? (() => {
          const layer = documentState.layers.find(item => item.id === imagePreviewDialog.layerId) ?? null
          return layer && isImageLayer(layer) ? layer : null
        })()
      : null
  const menuItems =
    layerMenu.item?.type === 'selection'
      ? [
          {
            view: 'Copy Selection',
            onClick: () => void copySelectionToClipboard(),
          },
          {
            view: 'Save Selection...',
            onClick: () => void saveSelectionImage(),
          },
          contextLayerId ? { isSeparator: true as const } : null,
          contextLayer && isImageLayer(contextLayer)
            ? {
                view: 'Preview Image...',
                onClick: () => openImagePreviewDialog(contextLayer.id),
              }
            : null,
          contextLayerId ? { isSeparator: true as const } : null,
          contextLayerId
            ? {
                view: 'Delete Object',
                onClick: () => deleteLayer(contextLayerId),
              }
            : null,
          contextLayerId ? { isSeparator: true as const } : null,
          contextLayerId
            ? {
                view: 'Set Position...',
                onClick: () => openPositionDialog(contextLayerId),
              }
            : null,
          contextLayer && !isHighlightLayer(contextLayer)
            ? {
                view: 'Set Size...',
                onClick: () => openSizeDialog(contextLayer.id),
              }
            : null,
        ]
      : layerMenu.item?.type === 'layer' && contextLayer
        ? [
            isImageLayer(contextLayer)
              ? {
                  view: 'Preview Image...',
                  onClick: () => openImagePreviewDialog(contextLayer.id),
                }
              : null,
            isImageLayer(contextLayer) ? { isSeparator: true as const } : null,
            {
              view: 'Delete Object',
              onClick: () => deleteLayer(contextLayer.id),
            },
            { isSeparator: true as const },
            {
              view: 'Set Position...',
              onClick: () => openPositionDialog(contextLayer.id),
            },
            !isHighlightLayer(contextLayer)
              ? {
                  view: 'Set Size...',
                  onClick: () => openSizeDialog(contextLayer.id),
                }
              : null,
          ]
        : []

  return (
    <div className="flex h-full min-h-0 flex-col bg-base-100 text-base-content">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 flex-col items-start gap-3 border-r border-base-content/10 px-3 py-4">
          <div className="flex gap-2 flex-wrap">
            <button
              className={cn('btn btn-square btn-sm', tool === 'select' ? 'btn-info' : 'btn-ghost')}
              onClick={() => setTool('select')}
              title="Select and transform objects"
            >
              <MousePointer2Icon className="size-4" />
            </button>
            <button
              className={cn('btn btn-square btn-sm', tool === 'marquee' ? 'btn-info' : 'btn-ghost')}
              onClick={() => setTool('marquee')}
              title="Create a rectangular canvas selection"
            >
              <ScanLineIcon className="size-4" />
            </button>
            <button
              className={cn('btn btn-square btn-sm', tool === 'highlight' ? 'btn-info' : 'btn-ghost')}
              onClick={() => setTool('highlight')}
              title="Paint highlight objects"
            >
              <span className="text-xs font-semibold">H</span>
            </button>
            <button
              className={cn('btn btn-square btn-sm', tool === 'shape' ? 'btn-info' : 'btn-ghost')}
              onClick={() => setTool('shape')}
              title="Create shape objects"
            >
              <span className="text-xs font-semibold">S</span>
            </button>
            <button
              className="btn btn-square btn-sm btn-ghost"
              onClick={handleUndo}
              disabled={!history.past.length}
              title="Undo"
            >
              <Undo2Icon className="size-4" />
            </button>
            <button
              className="btn btn-square btn-sm btn-ghost"
              onClick={handleRedo}
              disabled={!history.future.length}
              title="Redo"
            >
              <Redo2Icon className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <section>
              <Accordion title="Highlight Tool" defaultOpen>
                <div className="space-y-3 bg-base-200/60 text-sm text-base-content/70">
                  <div className="grid grid-cols-[auto_1fr] items-center gap-0">
                    <Label>Color</Label>
                    <InputColor
                      value={highlightSettings.color}
                      onChange={event =>
                        setHighlightSettings(current => ({
                          ...current,
                          color: event,
                        }))
                      }
                    />
                    <Label>Opacity</Label>
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <Input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        className="range range-xs"
                        value={highlightSettings.opacity}
                        onChange={event =>
                          setHighlightSettings(current => ({
                            ...current,
                            opacity: clampHighlightOpacity(Number(event)),
                          }))
                        }
                      />
                      <span className="w-10 text-right text-xs">{Math.round(highlightSettings.opacity * 100)}%</span>
                    </div>

                    <Label>Brush</Label>
                    <Select
                      options={[
                        { label: 'Circle', value: 'circle' },
                        { label: 'Square', value: 'square' },
                      ]}
                      value={highlightSettings.brushShape}
                      onChange={event =>
                        setHighlightSettings(current => ({
                          ...current,
                          brushShape: event as HighlightBrushShape,
                        }))
                      }
                    />
                    <Label>Size</Label>
                    <Input
                      type="number"
                      min={4}
                      max={256}
                      className="input input-xs"
                      value={highlightSettings.brushSize}
                      onChange={event =>
                        setHighlightSettings(current => ({
                          ...current,
                          brushSize: clampHighlightBrushSize(Number(event) || current.brushSize),
                        }))
                      }
                    />
                  </div>
                </div>
              </Accordion>
            </section>

            <section>
              <Accordion title="Shape Tool" defaultOpen>
                <div className="space-y-3 bg-base-200/60 text-sm text-base-content/70">
                  <div className="grid grid-cols-[auto_1fr] items-center gap-0">
                    <Label>Type</Label>
                    <Select
                      options={[
                        { label: 'Rectangle', value: 'rectangle' },
                        { label: 'Circle', value: 'circle' },
                        { label: 'Ellipse', value: 'ellipse' },
                      ]}
                      value={shapeSettings.shape}
                      onChange={event =>
                        setShapeSettings(current => ({
                          ...current,
                          shape: event as ShapeType,
                        }))
                      }
                    />
                    <Label>Fill</Label>
                    <InputColor
                      value={shapeSettings.fillColor}
                      onChange={value => setShapeSettings(current => ({ ...current, fillColor: value }))}
                    />
                    <Label>Border</Label>
                    <InputColor
                      value={shapeSettings.borderColor}
                      onChange={value => setShapeSettings(current => ({ ...current, borderColor: value }))}
                    />
                    <Label>Border Width</Label>

                    <Input
                      type="number"
                      min={0}
                      className="input input-xs"
                      value={shapeSettings.borderWidth ?? 2}
                      onChange={event =>
                        setShapeSettings(current => ({
                          ...current,
                          borderWidth: Math.max(0, Math.round(Number(event) || 0)),
                        }))
                      }
                    />
                    <Label>Radius</Label>
                    <Input
                      type="number"
                      min={0}
                      className="input input-xs"
                      value={shapeSettings.borderRadius}
                      onChange={event =>
                        setShapeSettings(current => ({
                          ...current,
                          borderRadius: Math.max(0, Math.round(Number(event) || 0)),
                        }))
                      }
                    />
                    <Label>Opacity</Label>
                    <GridCols>
                      <Input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        className="range range-xs"
                        value={shapeSettings.opacity}
                        onChange={event =>
                          setShapeSettings(current => ({
                            ...current,
                            opacity: clampShapeOpacity(Number(event)),
                          }))
                        }
                      />
                      <span className="w-10 text-right text-xs">{Math.round(shapeSettings.opacity * 100)}%</span>
                    </GridCols>
                  </div>
                </div>
              </Accordion>
            </section>

            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">
                Selection
              </div>
              <div className="rounded-2xl border border-base-content/10 bg-base-200/60 p-4 text-sm text-base-content/70">
                {documentState?.selection && selectionDraft ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button className="btn-sm btn-soft flex-1" onClick={() => void copySelectionToClipboard()}>
                        Copy
                      </Button>
                      <Button
                        className="btn-sm btn-soft flex-1"
                        onClick={() => void saveSelectionImage()}
                        disabled={isSaving}
                      >
                        Save PNG
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <div>
                        Origin: {formatPixels(documentState.selection.x)}, {formatPixels(documentState.selection.y)}
                      </div>
                      <div>
                        Size: {formatPixels(documentState.selection.width)} x{' '}
                        {formatPixels(documentState.selection.height)}
                      </div>
                    </div>

                    <form
                      className="space-y-2"
                      onSubmit={event => {
                        event.preventDefault()
                        applySelectionPosition()
                      }}
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">
                        Placement
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <label className="form-control gap-1">
                          <span className="label text-[11px]">X</span>
                          <input
                            className="input input-xs"
                            value={selectionDraft.x}
                            onChange={event =>
                              setSelectionDraft(current => (current ? { ...current, x: event.target.value } : current))
                            }
                          />
                        </label>
                        <label className="form-control gap-1">
                          <span className="label text-[11px]">Y</span>
                          <input
                            className="input input-xs"
                            value={selectionDraft.y}
                            onChange={event =>
                              setSelectionDraft(current => (current ? { ...current, y: event.target.value } : current))
                            }
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="btn btn-xs btn-info w-full"
                            disabled={isSelectionPositionUnchanged}
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
                        applySelectionSize()
                      }}
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">
                        Exact size
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <label className="form-control gap-1">
                          <span className="label text-[11px]">W</span>
                          <input
                            className="input input-xs"
                            value={selectionDraft.width}
                            onChange={event =>
                              setSelectionDraft(current =>
                                current ? { ...current, width: event.target.value } : current
                              )
                            }
                          />
                        </label>
                        <label className="form-control gap-1">
                          <span className="label text-[11px]">H</span>
                          <input
                            className="input input-xs"
                            value={selectionDraft.height}
                            onChange={event =>
                              setSelectionDraft(current =>
                                current ? { ...current, height: event.target.value } : current
                              )
                            }
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="btn btn-xs btn-info w-full"
                            disabled={isSelectionSizeUnchanged}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div>
                    Use the marquee tool to select any canvas region, then drag inside it to move the flattened image
                    selection.
                  </div>
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
            <Button
              icon={ImagePlusIcon}
              className="btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={!documentState}
            >
              Place image
            </Button>
            <Button
              icon={SaveIcon}
              className="btn-sm"
              onClick={() => void saveFinalImage()}
              disabled={!documentState || isSaving}
            >
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
                      Projects now live on disk with reusable history and image assets, so you can return to previous
                      work and switch between saved canvases.
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
                            <div className="ml-3 shrink-0 text-[11px] text-base-content/45">
                              {new Date(project.updatedAt).toLocaleDateString()}
                            </div>
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
                    if (!documentState) return
                    const canvas = overlayCanvasRef.current
                    if (!canvas) return
                    const pointer = getPointerOnCanvas(
                      event as unknown as React.PointerEvent<HTMLCanvasElement>,
                      canvas
                    )
                    const hit = hitLayer(documentState.layers, pointer)
                    const isSelectionHit = !!documentState.selection && pointInRect(pointer, documentState.selection)
                    if (isSelectionHit) {
                      layerMenu.onRightClick(event, { type: 'selection', layerId: hit?.id ?? null })
                      return
                    }
                    if (hit) {
                      layerMenu.onRightClick(event, { type: 'layer', layerId: hit.id })
                    }
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

            <aside className="flex min-h-0 w-80 flex-col gap-2 overflow-y-auto border-l border-base-content/10 px-4 py-4">
              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">
                  Project
                </div>
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
                          disabled={
                            projectNameDraft.value.trim().length === 0 || projectNameDraft.value.trim() === projectName
                          }
                        >
                          Rename
                        </button>
                      </div>
                    </label>
                    <div className="break-all text-xs text-base-content/55">
                      {projectPath ?? 'Unsaved project folder'}
                    </div>
                  </form>
                  <div className="text-xs text-base-content/55">
                    {hasUnsavedChanges ? 'Changes pending save.' : 'Project is saved.'}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="btn-sm flex-1"
                      onClick={() => void handleSaveProject()}
                      disabled={isProjectSaving}
                    >
                      Save
                    </Button>
                    <Button className="btn-sm btn-soft flex-1" onClick={() => void handleOpenProject()}>
                      Open
                    </Button>
                  </div>
                  {recentProjects.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">
                        Switch project
                      </div>
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
                {documentState ? (
                  <div className="space-y-3 py-4">
                    <PanelForm onSubmit={applyCanvasDraft} header="Canvas size">
                      <FormItem
                        label="W"
                        value={canvasDraft.width}
                        onChange={v => setCanvasDraft(current => ({ ...current, width: v }))}
                      />
                      <FormItem
                        label="H"
                        value={canvasDraft.height}
                        onChange={v => setCanvasDraft(current => ({ ...current, height: v }))}
                      />
                      <ApplyButton
                        disabled={
                          parseRoundedMathExpression(canvasDraft.width, resolvedExpressionVariables) ===
                            documentState.width &&
                          parseRoundedMathExpression(canvasDraft.height, resolvedExpressionVariables) ===
                            documentState.height
                        }
                      />
                    </PanelForm>
                    <PanelForm
                      onSubmit={() => applyPasteSize(pasteSizeDraft.width, pasteSizeDraft.height)}
                      header="Paste size"
                    >
                      <FormItem
                        label="W"
                        value={pasteSizeDraft.width}
                        onChange={v => setPasteSizeDraft(current => ({ ...current, width: v }))}
                      />
                      <FormItem
                        label="H"
                        value={pasteSizeDraft.height}
                        onChange={v => setPasteSizeDraft(current => ({ ...current, height: v }))}
                      />
                      <ApplyButton
                        disabled={
                          (pasteSizeDraft.width.trim().length
                            ? Math.max(
                                1,
                                parseRoundedMathExpression(pasteSizeDraft.width, resolvedExpressionVariables) ??
                                  Number.NaN
                              )
                            : null) === documentState.pasteWidth &&
                          (pasteSizeDraft.height.trim().length
                            ? Math.max(
                                1,
                                parseRoundedMathExpression(pasteSizeDraft.height, resolvedExpressionVariables) ??
                                  Number.NaN
                              )
                            : null) === documentState.pasteHeight
                        }
                      />
                    </PanelForm>
                    <PanelForm onSubmit={() => applyMovementStep()} header="Movement step">
                      <FormItem label="PX" value={movementStepDraft} onChange={v => setMovementStepDraft(v)} />
                      <ApplyButton disabled={movementStep === String(normalizedMovementStepDraft)} />
                    </PanelForm>
                  </div>
                ) : (
                  <p className="text-sm text-base-content/60">Pick a preset or enter a custom canvas size to begin.</p>
                )}
              </section>

              <section>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">
                  Active Object
                </div>
                <div className="pb-4 pt-2 text-sm text-base-content/70">
                  {activeLayer ? (
                    <div className="space-y-3">
                      <div className="font-medium text-base-content">
                        {activeLayer.name} {layerDescription(activeLayer)}
                      </div>
                      <div className="flex gap-2 text-xs">
                        <div>
                          Position: ({formatPixels(activeLayer.x)},{formatPixels(activeLayer.y)})
                        </div>
                        <div>
                          Display Size: {formatPixels(activeLayer.width)}x{formatPixels(activeLayer.height)}
                        </div>
                      </div>
                      {isImageLayer(activeLayer) && (
                        <div>
                          Raster size: {formatPixels(activeLayer.pixelWidth)}x{formatPixels(activeLayer.pixelHeight)}
                        </div>
                      )}
                      {layerPositionDraft && layerPositionDraft.layerId === activeLayer.id && (
                        <>
                          <form
                            className="space-y-2"
                            onSubmit={event => {
                              event.preventDefault()
                              applyInspectorPosition()
                            }}
                          >
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
                                <button
                                  type="submit"
                                  className="btn btn-xs btn-info w-full"
                                  disabled={isInspectorPositionUnchanged}
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
                          </form>
                        </>
                      )}
                      {!isHighlightLayer(activeLayer) &&
                        layerSizeDraft &&
                        layerSizeDraft.layerId === activeLayer.id && (
                          <form
                            className="space-y-2"
                            onSubmit={event => {
                              event.preventDefault()
                              applyInspectorSize()
                            }}
                          >
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">
                              Exact size
                            </div>
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
                                <button
                                  type="submit"
                                  className="btn btn-xs btn-info w-full"
                                  disabled={isInspectorSizeUnchanged}
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
                          </form>
                        )}
                      {activeHighlight && (
                        <div className="space-y-3 py-3">
                          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
                            <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">Color</span>
                            <input
                              type="color"
                              className="input input-xs h-9 w-full p-1"
                              value={activeHighlight.color}
                              onChange={event => applyActiveHighlightStyle({ color: event.target.value })}
                            />
                            <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">
                              Opacity
                            </span>
                            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                              <input
                                type="range"
                                min="0.05"
                                max="1"
                                step="0.05"
                                className="range range-xs"
                                value={activeHighlight.opacity}
                                onChange={event =>
                                  applyActiveHighlightStyle({
                                    opacity: clampHighlightOpacity(Number(event.target.value)),
                                  })
                                }
                              />
                              <span className="w-10 text-right text-xs">
                                {Math.round(activeHighlight.opacity * 100)}%
                              </span>
                            </div>
                            <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">Brush</span>
                            <select
                              className="select select-xs"
                              value={activeHighlight.brushShape}
                              onChange={event =>
                                applyActiveHighlightStyle({
                                  brushShape: event.target.value as HighlightBrushShape,
                                })
                              }
                            >
                              <option value="circle">Circle</option>
                              <option value="square">Square</option>
                            </select>
                            <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">Size</span>
                            <input
                              type="number"
                              min={4}
                              max={256}
                              className="input input-xs"
                              value={activeHighlight.brushSize}
                              onChange={event =>
                                applyActiveHighlightStyle({
                                  brushSize: clampHighlightBrushSize(
                                    Number(event.target.value) || activeHighlight.brushSize
                                  ),
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                      {activeShape && (
                        <>
                          <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">Type</span>
                          <select
                            className="select select-xs"
                            value={activeShape.shape}
                            onChange={event =>
                              applyActiveShapeStyle({
                                shape: event.target.value as ShapeType,
                              })
                            }
                          >
                            <option value="rectangle">Rectangle</option>
                            <option value="circle">Circle</option>
                            <option value="ellipse">Ellipse</option>
                          </select>
                          <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">Fill</span>
                          <input
                            type="color"
                            className="input input-xs h-9 w-full p-1"
                            value={activeShape.fillColor}
                            onChange={event => applyActiveShapeStyle({ fillColor: event.target.value })}
                          />
                          <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">Border</span>
                          <input
                            type="color"
                            className="input input-xs h-9 w-full p-1"
                            value={activeShape.borderColor}
                            onChange={event => applyActiveShapeStyle({ borderColor: event.target.value })}
                          />
                          <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">Radius</span>
                          <input
                            type="number"
                            min={0}
                            className="input input-xs"
                            value={activeShape.borderRadius}
                            disabled={activeShape.shape !== 'rectangle'}
                            onChange={event =>
                              applyActiveShapeStyle({
                                borderRadius: Math.max(0, Math.round(Number(event.target.value) || 0)),
                              })
                            }
                          />
                          <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">
                            Border Width
                          </span>
                          <input
                            type="number"
                            min={0}
                            className="input input-xs"
                            value={activeShape.borderWidth}
                            disabled={activeShape.shape !== 'rectangle'}
                            onChange={event =>
                              applyActiveShapeStyle({
                                borderWidth: Math.max(0, Math.round(Number(event.target.value) || 0)),
                              })
                            }
                          />
                          <span className="text-[11px] uppercase tracking-[0.14em] text-base-content/50">Opacity</span>
                          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                            <input
                              type="range"
                              min="0.05"
                              max="1"
                              step="0.05"
                              className="range range-xs"
                              value={activeShape.opacity}
                              onChange={event =>
                                applyActiveShapeStyle({
                                  opacity: clampShapeOpacity(Number(event.target.value)),
                                })
                              }
                            />
                            <span className="w-10 text-right text-xs">{Math.round(activeShape.opacity * 100)}%</span>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div>Select an object to inspect or move it.</div>
                  )}
                </div>
              </section>

              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">
                  Variables
                </div>
                <div className="space-y-3 rounded-2xl border border-base-content/10 bg-base-200/60 p-4 text-sm text-base-content/70">
                  <div className="space-y-2">
                    {customVariables.map(variable => {
                      const trimmedName = variable.name.trim()
                      const resolvedValue = trimmedName ? resolvedExpressionVariables[trimmedName] : undefined
                      const error = resolvedCustomVariables.errors[variable.id]

                      return (
                        <div
                          key={variable.id}
                          className="space-y-2 rounded-xl border border-base-content/10 bg-base-100/40 p-3"
                        >
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <label className="form-control gap-1">
                              <span className="label text-[11px]">Name</span>
                              <input
                                className="input input-xs"
                                value={variable.name}
                                placeholder="tileSize"
                                onChange={event => updateCustomVariable(variable.id, { name: event.target.value })}
                              />
                            </label>
                            <div className="flex items-end gap-2">
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost btn-square"
                                title="Remove variable"
                                onClick={() => removeCustomVariable(variable.id)}
                              >
                                <Trash2Icon className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-info"
                                onClick={applyCustomVariables}
                                disabled={Object.keys(resolvedCustomVariables.errors).length > 0}
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                          <label className="form-control gap-1">
                            <span className="label text-[11px]">Expression</span>
                            <input
                              className="input input-xs"
                              value={variable.expression}
                              placeholder="canvasWidth / 4"
                              onChange={event => updateCustomVariable(variable.id, { expression: event.target.value })}
                            />
                          </label>
                          <div className={cn('text-xs', error ? 'text-error' : 'text-base-content/55')}>
                            {error
                              ? error
                              : trimmedName && resolvedValue !== undefined
                                ? `Value: ${Math.round(resolvedValue)}`
                                : 'Enter a variable name and expression'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <Button className="btn-sm btn-soft w-full" onClick={addCustomVariable}>
                    Add Variable
                  </Button>
                </div>
              </section>

              <section>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-base-content/45">
                  Objects
                </div>
                <div className="rounded-2xl border border-base-content/10 bg-base-200/60 p-3 text-sm text-base-content/70">
                  {documentState && documentState.layers.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs text-base-content/55">
                        Top to bottom order. Use the arrows to change stacking.
                      </div>
                      {[...documentState.layers].reverse().map(layer => {
                        const originalIndex = documentState.layers.findIndex(
                          currentLayer => currentLayer.id === layer.id
                        )
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
                              className={cn(
                                'min-w-0 flex-1 text-left text-sm',
                                isActive ? 'text-base-content' : 'text-base-content/75'
                              )}
                              onClick={() =>
                                setDocumentState(current =>
                                  current ? { ...current, activeLayerId: layer.id } : current
                                )
                              }
                            >
                              <div className="truncate font-medium">{layer.name}</div>
                              <div className="text-[11px] uppercase tracking-[0.14em] text-base-content/45">
                                {layer.type}
                              </div>
                            </button>
                            <button
                              className="btn btn-xs btn-ghost"
                              onClick={() => moveLayer(layer.id, 'up')}
                              disabled={!canMoveUp}
                              title="Move toward front"
                            >
                              ↑
                            </button>
                            <button
                              className="btn btn-xs btn-ghost"
                              onClick={() => moveLayer(layer.id, 'down')}
                              disabled={!canMoveDown}
                              title="Move toward back"
                            >
                              ↓
                            </button>
                            <button
                              className="btn btn-xs btn-ghost text-error"
                              onClick={() => deleteLayer(layer.id)}
                              title="Delete object"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div>No objects yet.</div>
                  )}
                </div>
              </section>
            </aside>
          </div>

          <div className="flex items-center justify-between border-t border-base-content/10 px-4 py-2 text-xs text-base-content/55">
            <div>
              Tool:{' '}
              <span className="text-base-content/80">
                {tool === 'select'
                  ? 'Select'
                  : tool === 'marquee'
                    ? 'Marquee'
                    : tool === 'highlight'
                      ? 'Highlight'
                      : 'Shape'}
              </span>
            </div>
            <div>
              Shortcuts: <kbd className="kbd kbd-xs">Cmd</kbd> + <kbd className="kbd kbd-xs">Z</kbd> undo,{' '}
              <kbd className="kbd kbd-xs">Shift</kbd> + <kbd className="kbd kbd-xs">Cmd</kbd> +{' '}
              <kbd className="kbd kbd-xs">Z</kbd> redo
            </div>
          </div>
        </main>
      </div>

      {sizeDialog && (
        <Dialog title="Set Object Size" onClose={() => setSizeDialog(null)} className="max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={event => {
              event.preventDefault()
              applyExactSize()
            }}
          >
            <p className="text-sm text-base-content/70">
              Use math and variables like `imageWidth`, `imageHeight`, `canvasWidth`, and `canvasHeight`.
            </p>
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
                    const width = parseRoundedMathExpression(nextWidth, {
                      ...resolvedExpressionVariables,
                      imageX: layer.x,
                      imageY: layer.y,
                      imageWidth: layer.width,
                      imageHeight: layer.height,
                    })
                    if (width === null || !Number.isFinite(width)) {
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
                    const height = parseRoundedMathExpression(nextHeight, {
                      ...resolvedExpressionVariables,
                      imageX: layer.x,
                      imageY: layer.y,
                      imageWidth: layer.width,
                      imageHeight: layer.height,
                    })
                    if (height === null || !Number.isFinite(height)) {
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
            {(() => {
              const layer = documentState?.layers.find(item => item.id === sizeDialog.layerId)
              return layer && isImageLayer(layer) ? (
                <label className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={sizeDialog.keepAspectRatio}
                    onChange={event =>
                      setSizeDialog(current =>
                        current ? { ...current, keepAspectRatio: event.target.checked } : current
                      )
                    }
                  />
                  Keep aspect ratio
                </label>
              ) : null
            })()}
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
        <Dialog title="Set Object Placement" onClose={() => setPositionDialog(null)} className="max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={event => {
              event.preventDefault()
              applyExactPosition()
            }}
          >
            <p className="text-sm text-base-content/70">
              Coordinates use the top-left corner of the selected object on the document canvas. Use math and variables
              like `imageX`, `imageY`, `canvasWidth`, and `canvasHeight`.
            </p>
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

      {imagePreviewDialog && previewLayer && (
        <Dialog
          title={`Preview Image: ${previewLayer.name}`}
          onClose={() => setImagePreviewDialog(null)}
          className="h-[90vh] w-[90vw] max-h-[90vh] max-w-[90vw]"
        >
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-square"
                onClick={() =>
                  setImagePreviewDialog(current =>
                    current
                      ? {
                          ...current,
                          zoom: clampZoom(current.zoom / 1.25),
                        }
                      : current
                  )
                }
                title="Zoom out"
              >
                <MinusIcon className="size-4" />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-square"
                onClick={() =>
                  setImagePreviewDialog(current =>
                    current
                      ? {
                          ...current,
                          zoom: 1,
                        }
                      : current
                  )
                }
                title="Reset zoom"
              >
                <EyeIcon className="size-4" />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-square"
                onClick={() =>
                  setImagePreviewDialog(current =>
                    current
                      ? {
                          ...current,
                          zoom: clampZoom(current.zoom * 1.25),
                        }
                      : current
                  )
                }
                title="Zoom in"
              >
                <PlusIcon className="size-4" />
              </button>
              <div className="min-w-20 text-sm text-base-content/70">{Math.round(imagePreviewDialog.zoom * 100)}%</div>
              <input
                type="range"
                min="10"
                max="1600"
                step="10"
                className="range range-xs flex-1"
                value={Math.round(imagePreviewDialog.zoom * 100)}
                onChange={event =>
                  setImagePreviewDialog(current =>
                    current
                      ? {
                          ...current,
                          zoom: clampZoom(Number(event.target.value) / 100),
                        }
                      : current
                  )
                }
              />
            </div>
            <div className="text-xs text-base-content/55">
              Use the slider, buttons, or mouse wheel while hovering the preview.
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto rounded-2xl border border-base-content/10 bg-[#11141b] p-4"
              onWheel={event => {
                event.preventDefault()
                const direction = event.deltaY < 0 ? 1.1 : 1 / 1.1
                setImagePreviewDialog(current =>
                  current
                    ? {
                        ...current,
                        zoom: clampZoom(current.zoom * direction),
                      }
                    : current
                )
              }}
            >
              <div className="flex min-h-[24rem] min-w-full items-center justify-center">
                <img
                  src={previewLayer.dataUrl}
                  alt={previewLayer.name}
                  className="max-w-none select-none"
                  draggable={false}
                  style={{
                    width: previewLayer.pixelWidth * imagePreviewDialog.zoom,
                    height: previewLayer.pixelHeight * imagePreviewDialog.zoom,
                  }}
                />
              </div>
            </div>
          </div>
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
