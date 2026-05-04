import { useEffect, useMemo, useRef } from 'react'
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
import { ContextMenu, ContextMenuList, useContextMenu } from '@/lib/components/context-menu'
import { useShortcuts } from '@/lib/hooks/useShortcuts'
import { cn } from '@/lib/functions/clsx'
import { getWindowElectron, windowArgs } from '@/getWindowElectron'
import { clamp, normalizeRect, Point, pointInRect, Rect, snapToStep } from '@common/TransformUtils'
import { createLayerFromFile, cutSelectionFromDocument, loadImageElement } from './raster'
import { deserializeProject, serializeProject } from './projectPersistence'
import {
  EditorDocument,
  EditorLayer,
  EditorTool,
  HighlightLayer,
  ImageLayer,
  NewDocumentPreset,
  PixelSelection,
  ResizeHandle,
  ShapeLayer,
} from './types'
import {
  createShapeLayer,
  getShapeRectFromDrag,
  updateShapeLayerRect,
  drawShapeLayer,
  ShapeSettingsState,
} from './shapeUtils'
import {
  createHighlightLayer,
  getHighlightAbsolutePoints,
  updateHighlightLayerPoints,
  drawHighlightLayer,
  HighlightSettingsState,
} from './highlightUtils'
import {
  CustomVariableDraft,
  parseRoundedMathExpression,
  resolveCustomVariables,
} from '../utils/customVariableUtils'
import {
  CanvasDraftState,
  DEFAULT_EDITOR_SESSION,
  LayerPositionDraftState,
  LayerSizeDraftState,
  PasteSizeDraftState,
  SelectionDraftState,
} from './editorSession'
import {
  useCanvasDraftStore,
  useCustomVariablesStore,
  useLayerPositionDraftStore,
  useLayerSizeDraftStore,
  usePasteSizeDraftStore,
  useSelectionDraftStore,
  updateImagePreviewDialogStoreValue,
  useMovementStepDraftStore,
  useMovementStepStore,
  useProjectNameDraftStore,
  useToolStore,
  updateShapeSettingsStoreValue,
  updateHighlightSettingsStoreValue,
  getShapeSettingsStoreValue,
  getHighlightSettingsStoreValue,
  updateErrorMessageStoreValue,
  useInteractionStore,
  useSelectionPreviewStore,
  useIsSavingStore,
  useIsProjectSavingStore,
  useProjectPathStore,
  useProjectNameStore,
  useRecentProjectsStore,
  useImageRevisionStore,
} from './editorSimpleStores'
import {
  EditorHistoryState,
  getDocumentStateStoreValue,
  useDocumentStateStore,
  useHistoryStore,
} from './editorCoreStores'
import {
  useActiveLayerValue,
  useNormalizedMovementStepDraftValue,
  useNormalizedMovementStepValue,
  useResolvedCustomVariablesValue,
  useResolvedExpressionVariablesValue,
  useSelectionExpressionVariablesValue,
} from './editorDerivedValues'
import { pendingDraftSyncRef } from './editorDraftSyncState'
import {
  isHydratingProjectRef,
  updateHasUnsavedChangesStoreValue,
  useHasUnsavedChangesStoreValue,
} from './editorPersistenceState'
import { ShapeToolSection } from './ShapeToolSection'
import { EditorAutoSaveEffect } from './EditorAutoSaveEffect'
import { HighlightToolSection } from './HighlightToolSection'
import { ImagePreviewDialog } from './ImagePreviewDialog'
import { EditorErrorDialog } from './EditorErrorDialog'
import { SelectionSection } from './SelectionSection'
import { DocumentSettingsSection } from './DocumentSettingsSection'
import { ActiveLayerInspectorSection } from './ActiveLayerInspectorSection'
import { ObjectsListSection } from './ObjectsListSection'
import { VariablesSection } from './VariablesSection'

const DOCUMENT_PRESETS: NewDocumentPreset[] = [
  { label: 'Avatar', width: 512, height: 512 },
  { label: 'Square', width: 1024, height: 1024 },
  { label: 'Full HD', width: 1920, height: 1080 },
  { label: 'Poster', width: 2048, height: 2048 },
]

type CanvasContextMenuItem =
  | {
      type: 'layer'
      layerId: string
    }
  | {
      type: 'selection'
      layerId: string | null
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

export function EditorApp() {
  const [documentState, setDocumentState] = useDocumentStateStore()
  const [history, setHistory] = useHistoryStore()
  const [tool, setTool] = useToolStore()
  const [interaction, setInteraction] = useInteractionStore()
  const [selectionPreview, setSelectionPreview] = useSelectionPreviewStore()
  const [canvasDraft, setCanvasDraft] = useCanvasDraftStore()
  const [pasteSizeDraft, setPasteSizeDraft] = usePasteSizeDraftStore()
  const [movementStep, setMovementStep] = useMovementStepStore()
  const [movementStepDraft, setMovementStepDraft] = useMovementStepDraftStore()
  const [customVariables, setCustomVariables] = useCustomVariablesStore()
  const [layerPositionDraft, setLayerPositionDraft] = useLayerPositionDraftStore()
  const [layerSizeDraft, setLayerSizeDraft] = useLayerSizeDraftStore()
  const [selectionDraft, setSelectionDraft] = useSelectionDraftStore()
  const [projectNameDraft, setProjectNameDraft] = useProjectNameDraftStore()
  const [isSaving, setIsSaving] = useIsSavingStore()
  const [isProjectSaving, setIsProjectSaving] = useIsProjectSavingStore()
  const [projectPath, setProjectPath] = useProjectPathStore()
  const [projectName, setProjectName] = useProjectNameStore()
  const [recentProjects, setRecentProjects] = useRecentProjectsStore()
  const hasUnsavedChanges = useHasUnsavedChangesStoreValue()
  const [viewportRef, viewportBounds] = useMeasure()
  const inputRef = useRef<HTMLInputElement>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>())
  const [imageRevision, setImageRevision] = useImageRevisionStore()

  const activeLayer = useActiveLayerValue()
  const resolvedCustomVariables = useResolvedCustomVariablesValue()
  const resolvedExpressionVariables = useResolvedExpressionVariablesValue()
  const selectionExpressionVariables = useSelectionExpressionVariablesValue()

  function applyProjectState(args: {
    nextProjectPath: string | null
    nextProjectName: string
    nextDocumentState: EditorDocument | null
    nextHistory: EditorHistoryState
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
    updateHighlightSettingsStoreValue(args.nextHighlightSettings)
    updateShapeSettingsStoreValue(args.nextShapeSettings)
    pendingDraftSyncRef.current = {
      layerPosition: args.nextLayerPositionDraft,
      layerSize: args.nextLayerSizeDraft,
      selection: args.nextSelectionDraft,
      pasteSize: args.nextPasteSizeDraft,
    }
    setInteraction(null)
    setSelectionPreview(null)
    updateImagePreviewDialogStoreValue(null)
    setLayerPositionDraft(args.nextLayerPositionDraft)
    setLayerSizeDraft(args.nextLayerSizeDraft)
    setSelectionDraft(args.nextSelectionDraft)
    setPasteSizeDraft(args.nextPasteSizeDraft)
    updateHasUnsavedChangesStoreValue(false)
  }

  async function refreshRecentProjects() {
    try {
      setRecentProjects(await getWindowElectron().getRecentEditorProjects())
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to load recent projects')
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
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to open editor project')
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
          highlightSettings: getHighlightSettingsStoreValue(),
          shapeSettings: getShapeSettingsStoreValue(),
        },
      })

      await getWindowElectron().saveEditorProject({
        projectPath: nextProjectPath,
        request: serializedProject.request,
      })

      setProjectPath(nextProjectPath)
      setProjectName(serializedProject.request.project.name)
      updateHasUnsavedChangesStoreValue(false)
      await refreshRecentProjects()
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save editor project')
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
          highlightSettings: getHighlightSettingsStoreValue(),
          shapeSettings: getShapeSettingsStoreValue(),
        },
      })

      const response = await getWindowElectron().saveEditorProjectAs({
        request: serializedProject.request,
        defaultName: projectName,
      })

      if (!response.canceled && response.projectPath) {
        setProjectPath(response.projectPath)
        setProjectName(serializedProject.request.project.name)
        updateHasUnsavedChangesStoreValue(false)
        await refreshRecentProjects()
      }
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save editor project')
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
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to open editor project')
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
    updateHasUnsavedChangesStoreValue(true)
  }

  function applyProjectName() {
    const nextProjectName = projectNameDraft.value.trim()
    if (!nextProjectName) {
      updateErrorMessageStoreValue('Project name cannot be empty')
      return
    }

    if (nextProjectName === projectName) return
    setProjectName(nextProjectName)
    updateHasUnsavedChangesStoreValue(true)
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
      updateErrorMessageStoreValue('Movement step must be a valid number or math expression')
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
      updateErrorMessageStoreValue('Fix variable errors before applying them')
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

  const normalizedMovementStep = useNormalizedMovementStepValue()
  const normalizedMovementStepDraft = useNormalizedMovementStepDraftValue()

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
      updateErrorMessageStoreValue(
        'Paste width and height must be valid numbers or simple math expressions when provided'
      )
      return
    }
    if ((hasWidth && !Number.isFinite(pasteWidth)) || (hasHeight && !Number.isFinite(pasteHeight))) {
      updateErrorMessageStoreValue(
        'Paste width and height must be valid numbers or simple math expressions when provided'
      )
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
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to import image')
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

  function handleUndo() {
    setHistory(currentHistory => {
      const currentDocumentState = getDocumentStateStoreValue()
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
      const currentDocumentState = getDocumentStateStoreValue()
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
    if (!documentState) return
    const layer = createHighlightLayer([pointer], getHighlightSettingsStoreValue())
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
    const layer = createShapeLayer({ x: pointer.x, y: pointer.y, width: 1, height: 1 }, getShapeSettingsStoreValue())
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

    let constrainedPointer = pointer
    let nextAxisLock = interaction.axisLock

    if (!constrainAxis) {
      nextAxisLock = null
    } else if (lastPoint) {
      if (interaction.axisLock === null) {
        const deltaX = Math.abs(pointer.x - lastPoint.x)
        const deltaY = Math.abs(pointer.y - lastPoint.y)
        nextAxisLock = deltaX >= deltaY ? 'x' : 'y'
      }
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
    const rect = getShapeRectFromDrag(getShapeSettingsStoreValue(), interaction.start, pointer)
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

  function openImagePreviewDialog(layerId: string) {
    const layer = documentState?.layers.find(item => item.id === layerId)
    if (!layer || !isImageLayer(layer)) return
    updateImagePreviewDialogStoreValue({
      name: layer.name,
      dataUrl: layer.dataUrl,
      pixelWidth: layer.pixelWidth,
      pixelHeight: layer.pixelHeight,
      zoom: 1,
    })
  }

  function applySelectionPosition() {
    if (!documentState || !documentState.selection || !selectionDraft) return

    const x = parseRoundedMathExpression(selectionDraft.x, selectionExpressionVariables) ?? Number.NaN
    const y = parseRoundedMathExpression(selectionDraft.y, selectionExpressionVariables) ?? Number.NaN
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      updateErrorMessageStoreValue('Selection coordinates must be valid numbers or simple math expressions')
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
      updateErrorMessageStoreValue('Selection width and height must be valid numbers or simple math expressions')
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
      updateErrorMessageStoreValue('Image clipboard copy is not available in this environment')
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
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to copy selection to clipboard')
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
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save selection image')
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
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save image')
    } finally {
      setIsSaving(false)
    }
  }

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
      updateErrorMessageStoreValue('Canvas size must be valid numbers or simple math expressions')
      return
    }
    setCanvasSize(width, height)
  }

  const layerMenu = useContextMenu<CanvasContextMenuItem>()
  const selectionContextLayerId = layerMenu.item?.type === 'selection' ? layerMenu.item.layerId : null
  const contextLayerId = layerMenu.item?.type === 'layer' ? layerMenu.item.layerId : selectionContextLayerId
  const contextLayer =
    contextLayerId && documentState ? (documentState.layers.find(layer => layer.id === contextLayerId) ?? null) : null
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
          ]
        : []

  return (
    <div className="flex h-full min-h-0 flex-col bg-base-100 text-base-content">
      <EditorAutoSaveEffect
        interactionActive={interaction !== null}
        projectName={projectName}
        projectPath={projectPath}
        saveProjectToPath={saveProjectToPath}
      />
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
            <HighlightToolSection />

            <ShapeToolSection />

            {documentState?.selection && selectionDraft && (
              <SelectionSection
                canApplyPosition={!isSelectionPositionUnchanged}
                canApplySize={!isSelectionSizeUnchanged}
                onApplyPosition={applySelectionPosition}
                onApplySize={applySelectionSize}
                onCopy={() => void copySelectionToClipboard()}
                onSavePng={() => void saveSelectionImage()}
                isSaving={isSaving}
              />
            )}
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

              {documentState && (
                <DocumentSettingsSection
                  isCanvasSizeUnchanged={
                    parseRoundedMathExpression(canvasDraft.width, resolvedExpressionVariables) === documentState.width &&
                    parseRoundedMathExpression(canvasDraft.height, resolvedExpressionVariables) === documentState.height
                  }
                  isPasteSizeUnchanged={
                    (pasteSizeDraft.width.trim().length
                      ? Math.max(1, parseRoundedMathExpression(pasteSizeDraft.width, resolvedExpressionVariables) ?? Number.NaN)
                      : null) === documentState.pasteWidth &&
                    (pasteSizeDraft.height.trim().length
                      ? Math.max(1, parseRoundedMathExpression(pasteSizeDraft.height, resolvedExpressionVariables) ?? Number.NaN)
                      : null) === documentState.pasteHeight
                  }
                  isMovementStepUnchanged={movementStep === String(normalizedMovementStepDraft)}
                  onApplyCanvasDraft={applyCanvasDraft}
                  onApplyPasteSize={() => applyPasteSize(pasteSizeDraft.width, pasteSizeDraft.height)}
                  onApplyMovementStep={applyMovementStep}
                />
              )}

              <ActiveLayerInspectorSection />

              <VariablesSection
                customVariables={customVariables}
                resolvedCustomVariableErrors={resolvedCustomVariables.errors}
                resolvedExpressionVariables={resolvedExpressionVariables}
                onApplyCustomVariables={applyCustomVariables}
                onAddCustomVariable={addCustomVariable}
                onUpdateCustomVariable={updateCustomVariable}
                onRemoveCustomVariable={removeCustomVariable}
              />

              <ObjectsListSection />
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

      <ImagePreviewDialog />
      <EditorErrorDialog />
    </div>
  )
}
