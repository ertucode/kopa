import { useEffect, useMemo, useRef } from 'react'
import useMeasure from 'react-use-measure'
import { ContextMenu, ContextMenuList, useContextMenu } from '@/lib/components/context-menu'
import { useShortcuts } from '@/lib/hooks/useShortcuts'
import { getWindowElectron, windowArgs } from '@/getWindowElectron'
import { Point, pointInRect, Rect, snapToStep } from '@common/TransformUtils'
import { createLayerFromFile, loadImageElement } from './raster'
import { deserializeProject, serializeProject } from './projectPersistence'
import { EditorDocument, EditorTool, ImageLayer, ResizeHandle } from './types'
import { drawShapeLayer, ShapeSettingsState } from './shapeUtils'
import { drawHighlightLayer, HighlightSettingsState } from './highlightUtils'
import { CustomVariableDraft, parseRoundedMathExpression, resolveCustomVariables } from '../utils/customVariableUtils'
import {
  clampSelectionToDocument,
  cloneDocument,
  createDocument,
  getLayerRect,
  hitLayer,
  isHighlightLayer,
  isImageLayer,
  isShapeLayer,
} from '../utils/documentUtils'
import {
  beginHighlightCreation,
  beginLayerMove,
  beginResize,
  beginSelectionCreation,
  beginShapeCreation,
  cancelInteraction,
  finalizeInteraction,
  finishSelectionMove,
  startSelectionMove,
  updateHighlightCreation,
  updateLayerMove,
  updateLayerResize,
  updateSelectionCreation,
  updateSelectionMove,
  updateShapeCreation,
} from './interactionUtils'
import {
  CanvasDraftState,
  DEFAULT_EDITOR_SESSION,
  LayerPositionDraftState,
  LayerSizeDraftState,
  PasteSizeDraftState,
  SelectionDraftState,
} from './editorSession'
import {
  useLayerPositionDraftStore,
  useLayerSizeDraftStore,
  usePasteSizeDraftStore,
  useSelectionDraftStore,
  updateImagePreviewDialogStoreValue,
  useMovementStepStore,
  updateShapeSettingsStoreValue,
  updateHighlightSettingsStoreValue,
  getShapeSettingsStoreValue,
  getHighlightSettingsStoreValue,
  updateErrorMessageStoreValue,
  updateInteractionStoreValue,
  updateSelectionPreviewStoreValue,
  useInteractionStoreValue,
  useProjectPathStore,
  useProjectNameStore,
  useSelectionPreviewStoreValue,
  useImageRevisionStore,
  updateProjectPathStoreValue,
  updateProjectNameStoreValue,
  updateCanvasDraftStoreValue,
  updateCustomVariablesStoreValue,
  updateMovementStepDraftStoreValue,
  updateMovementStepStoreValue,
  updateProjectNameDraftStoreValue,
  updateToolStoreValue,
  updateLayerPositionDraftStoreValue,
  updateLayerSizeDraftStoreValue,
  updatePasteSizeDraftStoreValue,
  updateSelectionDraftStoreValue,
  getToolStoreValue,
  useToolStoreValue,
  useCanvasDraftStoreValue,
  useCustomVariablesStoreValue,
  getProjectNameStoreValue,
  getMovementStepDraftStoreValue,
  getIsSavingStoreValue,
  updateIsSavingStoreValue,
  updateRecentProjectsStoreValue,
  updateImageRevisionStoreValue,
  updateIsProjectSavingStoreValue,
  getCanvasDraftStoreValue,
  getMovementStepStoreValue,
  getPasteSizeDraftStoreValue,
  getLayerPositionDraftStoreValue,
  getLayerSizeDraftStoreValue,
  getSelectionDraftStoreValue,
  getCustomVariablesStoreValue,
  getInteractionStoreValue,
} from './editorSimpleStores'
import {
  EditorHistoryState,
  getDocumentStateStoreValue,
  getHistoryStoreValue,
  updateDocumentStateStoreValue,
  updateHistoryStoreValue,
  useDocumentStateStore,
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
  getHasUnsavedChangesStoreValue,
  isHydratingProjectRef,
  updateHasUnsavedChangesStoreValue,
} from './editorPersistenceState'
import { ShapeToolSection } from './ShapeToolSection'
import { EditorAutoSaveEffect } from './EditorAutoSaveEffect'
import { HighlightToolSection } from './HighlightToolSection'
import { ImagePreviewDialog } from './ImagePreviewDialog'
import { EditorErrorDialog } from './EditorErrorDialog'
import { SelectionSection } from './SelectionSection'
import { DocumentSettingsSection } from './DocumentSettingsSection'
import { ActiveLayerInspectorSection } from './ActiveLayerInspectorSection'
import { EditorFooter } from './EditorFooter'
import { EditorToolBarSection } from './EditorToolBarSection'
import { EditorTopBar } from './EditorTopBar'
import { EmptyProjectState } from './EmptyProjectState'
import { ObjectsListSection } from './ObjectsListSection'
import { ProjectSection } from './ProjectSection'
import { VariablesSection } from './VariablesSection'

type CanvasContextMenuItem =
  | {
      type: 'layer'
      layerId: string
    }
  | {
      type: 'selection'
      layerId: string | null
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

function getPointerOnCanvas(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  }
}

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
  updateProjectPathStoreValue(args.nextProjectPath)
  updateProjectNameStoreValue(args.nextProjectName)
  updateProjectNameDraftStoreValue({ value: args.nextProjectName })
  updateDocumentStateStoreValue(args.nextDocumentState)
  updateHistoryStoreValue(args.nextHistory)
  updateToolStoreValue(args.nextTool)
  updateCanvasDraftStoreValue(args.nextCanvasDraft)
  updateMovementStepStoreValue(args.nextMovementStep)
  updateMovementStepDraftStoreValue(args.nextMovementStepDraft)
  updateCustomVariablesStoreValue(args.nextVariables)
  updateHighlightSettingsStoreValue(args.nextHighlightSettings)
  updateShapeSettingsStoreValue(args.nextShapeSettings)
  pendingDraftSyncRef.current = {
    layerPosition: args.nextLayerPositionDraft,
    layerSize: args.nextLayerSizeDraft,
    selection: args.nextSelectionDraft,
    pasteSize: args.nextPasteSizeDraft,
  }
  updateInteractionStoreValue(null)
  updateSelectionPreviewStoreValue(null)
  updateImagePreviewDialogStoreValue(null)
  updateLayerPositionDraftStoreValue(args.nextLayerPositionDraft)
  updateLayerSizeDraftStoreValue(args.nextLayerSizeDraft)
  updateSelectionDraftStoreValue(args.nextSelectionDraft)
  updatePasteSizeDraftStoreValue(args.nextPasteSizeDraft)
  updateHasUnsavedChangesStoreValue(false)
}

async function refreshRecentProjects() {
  try {
    updateRecentProjectsStoreValue(await getWindowElectron().getRecentEditorProjects())
  } catch (error) {
    updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to load recent projects')
  }
}
function confirmDiscardUnsavedChanges() {
  if (!getHasUnsavedChangesStoreValue()) return true
  return window.confirm('You have unsaved editor changes. Continue and discard them?')
}
async function openProjectFromPath(nextProjectPath: string, providedName?: string) {
  try {
    const response = await getWindowElectron().loadEditorProject({ projectPath: nextProjectPath })
    const loadedProject = await deserializeProject(response.project, assetId =>
      getWindowElectron().loadEditorProjectAsset({ projectPath: response.projectPath, assetId })
    )

    imageCache.clear()
    updateImageRevisionStoreValue(revision => revision + 1)
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
const imageCache = new Map<string, HTMLImageElement>()

async function saveProjectToPath(nextProjectPath: string) {
  updateIsProjectSavingStoreValue(true)

  try {
    const serializedProject = await serializeProject(getProjectToSerialize())

    await getWindowElectron().saveEditorProject({
      projectPath: nextProjectPath,
      request: serializedProject.request,
    })

    updateProjectPathStoreValue(nextProjectPath)
    updateProjectNameStoreValue(serializedProject.request.project.name)
    updateHasUnsavedChangesStoreValue(false)
    await refreshRecentProjects()
  } catch (error) {
    updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save editor project')
  } finally {
    updateIsProjectSavingStoreValue(false)
  }
}

function getProjectToSerialize(): Parameters<typeof serializeProject>[0] {
  return {
    name: getProjectNameStoreValue(),
    documentState: getDocumentStateStoreValue(),
    history: getHistoryStoreValue(),
    ui: {
      tool: getToolStoreValue(),
      canvasDraft: getCanvasDraftStoreValue(),
      movementStep: getMovementStepStoreValue(),
      movementStepDraft: getMovementStepDraftStoreValue(),
      pasteSizeDraft: getPasteSizeDraftStoreValue(),
      layerPositionDraft: getLayerPositionDraftStoreValue(),
      layerSizeDraft: getLayerSizeDraftStoreValue(),
      selectionDraft: getSelectionDraftStoreValue(),
      variables: getCustomVariablesStoreValue(),
      highlightSettings: getHighlightSettingsStoreValue(),
      shapeSettings: getShapeSettingsStoreValue(),
    },
  }
}

export function EditorApp() {
  const [documentState, setDocumentState] = useDocumentStateStore()
  const tool = useToolStoreValue()
  const selectionPreview = useSelectionPreviewStoreValue()
  const canvasDraft = useCanvasDraftStoreValue()
  const [pasteSizeDraft, setPasteSizeDraft] = usePasteSizeDraftStore()
  const [movementStep, setMovementStep] = useMovementStepStore()
  const customVariables = useCustomVariablesStoreValue()
  const [layerPositionDraft, setLayerPositionDraft] = useLayerPositionDraftStore()
  const [layerSizeDraft, setLayerSizeDraft] = useLayerSizeDraftStore()
  const [selectionDraft, setSelectionDraft] = useSelectionDraftStore()
  const [projectPath, setProjectPath] = useProjectPathStore()
  const [projectName, setProjectName] = useProjectNameStore()
  const [viewportRef, viewportBounds] = useMeasure()
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const [imageRevision, _] = useImageRevisionStore()

  const activeLayer = useActiveLayerValue()
  const resolvedCustomVariables = useResolvedCustomVariablesValue()
  const resolvedExpressionVariables = useResolvedExpressionVariablesValue()
  const selectionExpressionVariables = useSelectionExpressionVariablesValue()

  async function handleSaveProjectAs() {
    updateIsProjectSavingStoreValue(true)

    try {
      const serializedProject = await serializeProject(getProjectToSerialize())

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
      updateIsProjectSavingStoreValue(false)
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

      imageCache.clear()
      updateImageRevisionStoreValue(revision => revision + 1)
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
    const nextProjectName = getProjectNameStoreValue().trim()
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
    const movementStepDraft = getMovementStepDraftStoreValue()
    const parsedMovementStep = parseRoundedMathExpression(movementStepDraft, movementStepVariables)
    const nextMovementStep = Math.max(1, parsedMovementStep ?? Number.NaN)
    if (!Number.isFinite(nextMovementStep)) {
      updateErrorMessageStoreValue('Movement step must be a valid number or math expression')
      return
    }
    setMovementStep(String(nextMovementStep))
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

    const movementStepDraft = getMovementStepDraftStoreValue()
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
        if (imageCache.has(url)) return
        const image = await loadImageElement(url)
        if (!cancelled) {
          imageCache.set(url, image)
        }
      })

      await Promise.all(loads)
      if (!cancelled) {
        updateImageRevisionStoreValue(revision => revision + 1)
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
      const image = imageCache.get(layer.dataUrl)
      if (!image) continue
      mainContext.save()
      mainContext.globalAlpha = layer.opacity
      mainContext.imageSmoothingEnabled = true
      mainContext.drawImage(image, layer.x, layer.y, layer.width, layer.height)
      mainContext.restore()
    }

    if (selectionPreview) {
      const floatingImage = imageCache.get(selectionPreview.floatingDataUrl)
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
    updateHistoryStoreValue(current => ({
      past: [...current.past, { label, document: cloneDocument(previousDocument) }],
      future: [],
    }))
  }

  function setCommittedDocument(documentValue: EditorDocument, label: string) {
    setDocumentState(current => {
      if (!current) {
        updateHistoryStoreValue({ past: [], future: [] })
        return documentValue
      }
      updateHistoryStoreValue(historyState => ({
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
    updateHistoryStoreValue(currentHistory => {
      const currentDocumentState = getDocumentStateStoreValue()
      const previousEntry = currentHistory.past[currentHistory.past.length - 1]
      if (!previousEntry || !currentDocumentState) return currentHistory
      setDocumentState(previousEntry.document)
      updateInteractionStoreValue(null)
      updateSelectionPreviewStoreValue(null)
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
    updateHistoryStoreValue(currentHistory => {
      const currentDocumentState = getDocumentStateStoreValue()
      const [nextEntry, ...remainingFuture] = currentHistory.future
      if (!nextEntry || !currentDocumentState) return currentHistory
      setDocumentState(nextEntry.document)
      updateInteractionStoreValue(null)
      updateSelectionPreviewStoreValue(null)
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
    const tool = getToolStoreValue()

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

      beginSelectionCreation(pointer, layer?.id ?? documentState.activeLayerId)
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
    const interaction = getInteractionStoreValue()
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
    const interaction = getInteractionStoreValue()
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
      finishSelectionMove()
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
    if (!documentState?.selection || !mainCanvasRef.current || getIsSavingStoreValue()) return

    try {
      updateIsSavingStoreValue(true)
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
      updateIsSavingStoreValue(false)
    }
  }

  async function saveFinalImage() {
    if (!documentState || !mainCanvasRef.current || getIsSavingStoreValue()) return

    try {
      updateIsSavingStoreValue(true)
      const dataUrl = mainCanvasRef.current.toDataURL('image/png')
      const defaultFileName = `kopa-${documentState.width}x${documentState.height}.png`
      await getWindowElectron().saveFinalImage({ dataUrl, defaultFileName })
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save image')
    } finally {
      updateIsSavingStoreValue(false)
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
      <EditorAutoSaveEffect saveProjectToPath={saveProjectToPath} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 flex-col border-r border-base-content/10">
          <EditorToolBarSection />
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
            />
          )}
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <EditorTopBar
            onCreateNewProject={() => createNewDocument(1024, 1024)}
            onOpenProject={handleOpenProject}
            onSaveProject={handleSaveProject}
            onSaveFinalImage={saveFinalImage}
            onImportFiles={importFiles}
          />

          <div className="flex min-h-0 flex-1">
            <section
              ref={viewportRef}
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden "
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
              <EmptyProjectState
                onCreateNewDocument={createNewDocument}
                onOpenRecentProject={handleOpenRecentProject}
                onApplyCanvasDraft={applyCanvasDraft}
              />

              {documentState && (
                <div
                  className="relative border border-white/10 bg-[#11141b]"
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

            <aside className="flex min-h-0 w-80 flex-col overflow-y-auto border-l border-base-content/10">
              <ProjectSection
                onApplyProjectName={applyProjectName}
                onSaveProject={handleSaveProject}
                onOpenProject={handleOpenProject}
                onOpenRecentProject={handleOpenRecentProject}
              />

              {documentState && (
                <DocumentSettingsSection
                  isCanvasSizeUnchanged={
                    parseRoundedMathExpression(canvasDraft.width, resolvedExpressionVariables) ===
                      documentState.width &&
                    parseRoundedMathExpression(canvasDraft.height, resolvedExpressionVariables) === documentState.height
                  }
                  isPasteSizeUnchanged={
                    (pasteSizeDraft.width.trim().length
                      ? Math.max(
                          1,
                          parseRoundedMathExpression(pasteSizeDraft.width, resolvedExpressionVariables) ?? Number.NaN
                        )
                      : null) === documentState.pasteWidth &&
                    (pasteSizeDraft.height.trim().length
                      ? Math.max(
                          1,
                          parseRoundedMathExpression(pasteSizeDraft.height, resolvedExpressionVariables) ?? Number.NaN
                        )
                      : null) === documentState.pasteHeight
                  }
                  isMovementStepUnchanged={movementStep === String(normalizedMovementStepDraft)}
                  onApplyCanvasDraft={applyCanvasDraft}
                  onApplyPasteSize={() => applyPasteSize(pasteSizeDraft.width, pasteSizeDraft.height)}
                  onApplyMovementStep={applyMovementStep}
                />
              )}

              <ActiveLayerInspectorSection />

              <VariablesSection onApplyCustomVariables={applyCustomVariables} />

              <ObjectsListSection />
            </aside>
          </div>

          <EditorFooter />
        </main>
      </div>

      <ImagePreviewDialog />
      <EditorErrorDialog />
    </div>
  )
}
