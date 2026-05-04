import { createSimpleStore } from '@/lib/stores/createSimpleStore'
import { DEFAULT_EDITOR_SESSION } from './editorSession'

export const { ToolStore, ToolStoreActions, useToolStore, useToolStoreValue } = createSimpleStore(
  DEFAULT_EDITOR_SESSION.tool,
  'Tool'
)

export const { CanvasDraftStore, CanvasDraftStoreActions, useCanvasDraftStore, useCanvasDraftStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.canvasDraft, 'CanvasDraft')

export const { MovementStepStore, MovementStepStoreActions, useMovementStepStore, useMovementStepStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.movementStep, 'MovementStep')

export const {
  MovementStepDraftStore,
  MovementStepDraftStoreActions,
  useMovementStepDraftStore,
  useMovementStepDraftStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.movementStepDraft, 'MovementStepDraft')

export const {
  CustomVariablesStore,
  CustomVariablesStoreActions,
  useCustomVariablesStore,
  useCustomVariablesStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.variables, 'CustomVariables')

export const {
  ProjectNameDraftStore,
  ProjectNameDraftStoreActions,
  useProjectNameDraftStore,
  useProjectNameDraftStoreValue,
} = createSimpleStore({ value: 'Untitled Project' }, 'ProjectNameDraft')

export const { ErrorMessageStore, ErrorMessageStoreActions, useErrorMessageStore, useErrorMessageStoreValue } =
  createSimpleStore<string | null, 'ErrorMessage'>(null, 'ErrorMessage')

export const {
  HighlightSettingsStore,
  HighlightSettingsStoreActions,
  useHighlightSettingsStore,
  useHighlightSettingsStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.highlightSettings, 'HighlightSettings')

export const { ShapeSettingsStore, ShapeSettingsStoreActions, useShapeSettingsStore, useShapeSettingsStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.shapeSettings, 'ShapeSettings')
