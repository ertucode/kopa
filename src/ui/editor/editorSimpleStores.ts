import { createSimpleStore } from '@/lib/stores/createSimpleStore'
import { RecentEditorProject } from '@common/EditorProject'
import { Point, Rect } from '@common/TransformUtils'
import { DEFAULT_EDITOR_SESSION, ImagePreviewDialogState } from './editorSession'
import { EditorDocument, PixelSelection, ResizeHandle } from './types'

export type InteractionState =
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

export type SelectionPreview = {
  floatingDataUrl: string
  selection: PixelSelection
}

export const { ToolStore, updateToolStoreValue, useToolStore, useToolStoreValue, getToolStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.tool, 'Tool')

export const {
  InteractionStore,
  updateInteractionStoreValue,
  useInteractionStore,
  useInteractionStoreValue,
  getInteractionStoreValue,
} = createSimpleStore<InteractionState, 'Interaction'>(null, 'Interaction')

export const {
  SelectionPreviewStore,
  updateSelectionPreviewStoreValue,
  useSelectionPreviewStore,
  useSelectionPreviewStoreValue,
  getSelectionPreviewStoreValue,
} = createSimpleStore<SelectionPreview | null, 'SelectionPreview'>(null, 'SelectionPreview')

export const {
  CanvasDraftStore,
  updateCanvasDraftStoreValue,
  useCanvasDraftStore,
  useCanvasDraftStoreValue,
  getCanvasDraftStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.canvasDraft, 'CanvasDraft')

export const {
  MovementStepStore,
  updateMovementStepStoreValue,
  useMovementStepStore,
  useMovementStepStoreValue,
  getMovementStepStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.movementStep, 'MovementStep')

export const {
  MovementStepDraftStore,
  updateMovementStepDraftStoreValue,
  useMovementStepDraftStore,
  useMovementStepDraftStoreValue,
  getMovementStepDraftStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.movementStepDraft, 'MovementStepDraft')

export const {
  CustomVariablesStore,
  updateCustomVariablesStoreValue,
  useCustomVariablesStore,
  useCustomVariablesStoreValue,
  getCustomVariablesStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.variables, 'CustomVariables')

export const {
  ProjectNameDraftStore,
  updateProjectNameDraftStoreValue,
  useProjectNameDraftStore,
  useProjectNameDraftStoreValue,
  getProjectNameDraftStoreValue,
} = createSimpleStore({ value: 'Untitled Project' }, 'ProjectNameDraft')

export const {
  IsSavingStore,
  updateIsSavingStoreValue,
  useIsSavingStore,
  useIsSavingStoreValue,
  getIsSavingStoreValue,
} = createSimpleStore(false, 'IsSaving')

export const {
  IsProjectSavingStore,
  updateIsProjectSavingStoreValue,
  useIsProjectSavingStore,
  useIsProjectSavingStoreValue,
  getIsProjectSavingStoreValue,
} = createSimpleStore(false, 'IsProjectSaving')

export const {
  ProjectPathStore,
  updateProjectPathStoreValue,
  useProjectPathStore,
  useProjectPathStoreValue,
  getProjectPathStoreValue,
} = createSimpleStore<string | null, 'ProjectPath'>(null, 'ProjectPath')

export const {
  ProjectNameStore,
  updateProjectNameStoreValue,
  useProjectNameStore,
  useProjectNameStoreValue,
  getProjectNameStoreValue,
} = createSimpleStore('Untitled Project', 'ProjectName')

export const {
  RecentProjectsStore,
  updateRecentProjectsStoreValue,
  useRecentProjectsStore,
  useRecentProjectsStoreValue,
  getRecentProjectsStoreValue,
} = createSimpleStore<RecentEditorProject[], 'RecentProjects'>([], 'RecentProjects')

export const {
  ImageRevisionStore,
  updateImageRevisionStoreValue,
  useImageRevisionStore,
  useImageRevisionStoreValue,
  getImageRevisionStoreValue,
} = createSimpleStore(0, 'ImageRevision')

export const {
  PasteSizeDraftStore,
  updatePasteSizeDraftStoreValue,
  usePasteSizeDraftStore,
  usePasteSizeDraftStoreValue,
  getPasteSizeDraftStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.pasteSizeDraft, 'PasteSizeDraft')

export const {
  LayerPositionDraftStore,
  updateLayerPositionDraftStoreValue,
  useLayerPositionDraftStore,
  useLayerPositionDraftStoreValue,
  getLayerPositionDraftStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.layerPositionDraft, 'LayerPositionDraft')

export const {
  LayerSizeDraftStore,
  updateLayerSizeDraftStoreValue,
  useLayerSizeDraftStore,
  useLayerSizeDraftStoreValue,
  getLayerSizeDraftStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.layerSizeDraft, 'LayerSizeDraft')

export const {
  SelectionDraftStore,
  updateSelectionDraftStoreValue,
  useSelectionDraftStore,
  useSelectionDraftStoreValue,
  getSelectionDraftStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.selectionDraft, 'SelectionDraft')

export const { ErrorMessageStore, updateErrorMessageStoreValue, useErrorMessageStore, useErrorMessageStoreValue } =
  createSimpleStore<string | null, 'ErrorMessage'>(null, 'ErrorMessage')

export const {
  HighlightSettingsStore,
  updateHighlightSettingsStoreValue,
  useHighlightSettingsStore,
  useHighlightSettingsStoreValue,
  getHighlightSettingsStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.highlightSettings, 'HighlightSettings')

export const {
  ShapeSettingsStore,
  updateShapeSettingsStoreValue,
  useShapeSettingsStore,
  useShapeSettingsStoreValue,
  getShapeSettingsStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.shapeSettings, 'ShapeSettings')

export const {
  ImagePreviewDialogStore,
  updateImagePreviewDialogStoreValue,
  useImagePreviewDialogStore,
  useImagePreviewDialogStoreValue,
  getImagePreviewDialogStoreValue,
} = createSimpleStore<ImagePreviewDialogState | null, 'ImagePreviewDialog'>(null, 'ImagePreviewDialog')
