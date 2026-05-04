import { createSimpleStore } from '@/lib/stores/createSimpleStore'
import { DEFAULT_EDITOR_SESSION, ImagePreviewDialogState } from './editorSession'

export const { ToolStore, updateToolStoreValue, useToolStore, useToolStoreValue, getToolStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.tool, 'Tool')

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
