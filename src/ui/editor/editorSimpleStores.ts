import { createSimpleStore } from '@/lib/stores/createSimpleStore'
import { DEFAULT_EDITOR_SESSION } from './editorSession'

export const { ToolStore, updateToolStoreValue, useToolStore, useToolStoreValue } = createSimpleStore(
  DEFAULT_EDITOR_SESSION.tool,
  'Tool'
)

export const { CanvasDraftStore, updateCanvasDraftStoreValue, useCanvasDraftStore, useCanvasDraftStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.canvasDraft, 'CanvasDraft')

export const { MovementStepStore, updateMovementStepStoreValue, useMovementStepStore, useMovementStepStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.movementStep, 'MovementStep')

export const {
  MovementStepDraftStore,
  updateMovementStepDraftStoreValue,
  useMovementStepDraftStore,
  useMovementStepDraftStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.movementStepDraft, 'MovementStepDraft')

export const {
  CustomVariablesStore,
  updateCustomVariablesStoreValue,
  useCustomVariablesStore,
  useCustomVariablesStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.variables, 'CustomVariables')

export const {
  ProjectNameDraftStore,
  updateProjectNameDraftStoreValue,
  useProjectNameDraftStore,
  useProjectNameDraftStoreValue,
} = createSimpleStore({ value: 'Untitled Project' }, 'ProjectNameDraft')

export const { ErrorMessageStore, updateErrorMessageStoreValue, useErrorMessageStore, useErrorMessageStoreValue } =
  createSimpleStore<string | null, 'ErrorMessage'>(null, 'ErrorMessage')

export const {
  HighlightSettingsStore,
  updateHighlightSettingsStoreValue,
  useHighlightSettingsStore,
  useHighlightSettingsStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.highlightSettings, 'HighlightSettings')

export const { ShapeSettingsStore, updateShapeSettingsStoreValue, useShapeSettingsStore, useShapeSettingsStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.shapeSettings, 'ShapeSettings')
