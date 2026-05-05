import { getWindowElectron } from '@/getWindowElectron'
import { createDocument, cloneDocument } from '../utils/documentUtils'
import { deserializeProject, serializeProject } from './projectPersistence'
import { DEFAULT_EDITOR_SESSION } from './editorSession'
import {
  getCanvasDraftStoreValue,
  getCustomVariablesStoreValue,
  getHighlightSettingsStoreValue,
  getLayerPositionDraftStoreValue,
  getLayerSizeDraftStoreValue,
  getMovementStepDraftStoreValue,
  getMovementStepStoreValue,
  getPasteSizeDraftStoreValue,
  getProjectNameStoreValue,
  getProjectPathStoreValue,
  getSelectionDraftStoreValue,
  getShapeSettingsStoreValue,
  getToolStoreValue,
  updateCanvasDraftStoreValue,
  updateCustomVariablesStoreValue,
  updateErrorMessageStoreValue,
  updateHighlightSettingsStoreValue,
  updateImagePreviewDialogStoreValue,
  updateInteractionStoreValue,
  updateLayerPositionDraftStoreValue,
  updateLayerSizeDraftStoreValue,
  updateMovementStepDraftStoreValue,
  updateMovementStepStoreValue,
  updatePasteSizeDraftStoreValue,
  updateProjectNameDraftStoreValue,
  updateProjectNameStoreValue,
  updateProjectPathStoreValue,
  updateRecentProjectsStoreValue,
  updateSelectionDraftStoreValue,
  updateSelectionPreviewStoreValue,
  updateShapeSettingsStoreValue,
  updateToolStoreValue,
  updateIsProjectSavingStoreValue,
  updateImageRevisionStoreValue,
} from './editorSimpleStores'
import {
  getDocumentStateStoreValue,
  getHistoryStoreValue,
  updateDocumentStateStoreValue,
  updateHistoryStoreValue,
  type EditorHistoryState,
} from './editorCoreStores'
import { pendingDraftSyncRef } from './editorDraftSyncState'
import {
  getHasUnsavedChangesStoreValue,
  isHydratingProjectRef,
  updateHasUnsavedChangesStoreValue,
} from './editorPersistenceState'
import {
  CanvasDraftState,
  LayerPositionDraftState,
  LayerSizeDraftState,
  PasteSizeDraftState,
  SelectionDraftState,
} from './editorSession'
import { CustomVariableDraft } from '../utils/customVariableUtils'
import { EditorDocument, EditorTool } from './types'
import { HighlightSettingsState } from './highlightUtils'
import { ShapeSettingsState } from './shapeUtils'
import { imageCache } from './editorImageCache'

type ApplyProjectStateArgs = {
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
}

function applyProjectState(args: ApplyProjectStateArgs) {
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

async function loadProjectIntoEditor(args: { projectPath: string; project: Parameters<typeof deserializeProject>[0]; name: string }) {
  const loadedProject = await deserializeProject(args.project, assetId =>
    getWindowElectron().loadEditorProjectAsset({ projectPath: args.projectPath, assetId })
  )

  imageCache.clear()
  updateImageRevisionStoreValue(revision => revision + 1)
  applyProjectState({
    nextProjectPath: args.projectPath,
    nextProjectName: args.name,
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
}

export async function refreshRecentProjects() {
  try {
    updateRecentProjectsStoreValue(await getWindowElectron().getRecentEditorProjects())
  } catch (error) {
    updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to load recent projects')
  }
}

export function confirmDiscardUnsavedChanges() {
  if (!getHasUnsavedChangesStoreValue()) return true
  return window.confirm('You have unsaved editor changes. Continue and discard them?')
}

export async function openProjectFromPath(nextProjectPath: string, providedName?: string) {
  try {
    const response = await getWindowElectron().loadEditorProject({ projectPath: nextProjectPath })
    await loadProjectIntoEditor({
      projectPath: response.projectPath,
      project: response.project,
      name: providedName ?? response.project.name,
    })
    await refreshRecentProjects()
  } catch (error) {
    updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to open editor project')
  }
}

export function getProjectToSerialize(): Parameters<typeof serializeProject>[0] {
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

export async function saveProjectToPath(nextProjectPath: string) {
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

export async function handleSaveProjectAs() {
  updateIsProjectSavingStoreValue(true)

  try {
    const serializedProject = await serializeProject(getProjectToSerialize())

    const response = await getWindowElectron().saveEditorProjectAs({
      request: serializedProject.request,
      defaultName: getProjectNameStoreValue(),
    })

    if (!response.canceled && response.projectPath) {
      updateProjectPathStoreValue(response.projectPath)
      updateProjectNameStoreValue(serializedProject.request.project.name)
      updateHasUnsavedChangesStoreValue(false)
      await refreshRecentProjects()
    }
  } catch (error) {
    updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save editor project')
  } finally {
    updateIsProjectSavingStoreValue(false)
  }
}

export async function handleSaveProject() {
  const projectPath = getProjectPathStoreValue()
  if (projectPath) {
    await saveProjectToPath(projectPath)
    return
  }

  await handleSaveProjectAs()
}

export async function handleOpenProject() {
  if (!confirmDiscardUnsavedChanges()) return

  try {
    const response = await getWindowElectron().openEditorProject()
    if (response.canceled || !response.projectPath || !response.project) return

    await loadProjectIntoEditor({
      projectPath: response.projectPath,
      project: response.project,
      name: response.project.name,
    })
    await refreshRecentProjects()
  } catch (error) {
    updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to open editor project')
  }
}

export async function handleOpenRecentProject(nextProjectPath: string) {
  if (!confirmDiscardUnsavedChanges()) return
  await openProjectFromPath(nextProjectPath)
}

export function startNewProject(width: number, height: number) {
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

export function applyProjectName() {
  const nextProjectName = getProjectNameStoreValue().trim()
  if (!nextProjectName) {
    updateErrorMessageStoreValue('Project name cannot be empty')
    return
  }

  if (nextProjectName === getProjectNameStoreValue()) return
  updateProjectNameStoreValue(nextProjectName)
  updateHasUnsavedChangesStoreValue(true)
}

export function pushHistory(label: string, previousDocument: EditorDocument, nextDocument: EditorDocument) {
  updateDocumentStateStoreValue(nextDocument)
  updateHistoryStoreValue(current => ({
    past: [...current.past, { label, document: cloneDocument(previousDocument) }],
    future: [],
  }))
}

export function setCommittedDocument(documentValue: EditorDocument, label: string) {
  updateDocumentStateStoreValue(current => {
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

export function createNewDocument(width: number, height: number) {
  startNewProject(width, height)
}

export function setCanvasSize(width: number, height: number) {
  const documentState = getDocumentStateStoreValue()
  if (!documentState) {
    createNewDocument(width, height)
    return
  }

  setCommittedDocument({ ...cloneDocument(documentState), width, height }, 'Resize canvas')
}
