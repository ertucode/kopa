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
  HighlightSettingsStore,
  HighlightSettingsStoreActions,
  useHighlightSettingsStore,
  useHighlightSettingsStoreValue,
} = createSimpleStore(DEFAULT_EDITOR_SESSION.highlightSettings, 'HighlightSettings')

export const { ShapeSettingsStore, ShapeSettingsStoreActions, useShapeSettingsStore, useShapeSettingsStoreValue } =
  createSimpleStore(DEFAULT_EDITOR_SESSION.shapeSettings, 'ShapeSettings')
