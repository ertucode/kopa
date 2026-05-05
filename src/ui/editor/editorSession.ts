import { CustomVariableDraft } from '@/utils/customVariableUtils'
import { HighlightSettingsState } from './highlightUtils'
import { ShapeSettingsState } from './shapeUtils'
import { DEFAULT_FONT_FAMILY, TextSettingsState } from './textUtils'
import { EditorTool } from './types'

export type CanvasDraftState = {
  width: string
  height: string
}

export type PasteSizeDraftState = {
  width: string
  height: string
}

export type LayerPositionDraftState = {
  layerId: string
  x: string
  y: string
}

export type LayerSizeDraftState = {
  layerId: string
  width: string
  height: string
}
export type SelectionDraftState = {
  x: string
  y: string
  width: string
  height: string
}

export type ImagePreviewDialogState = {
  name: string
  dataUrl: string
  pixelWidth: number
  pixelHeight: number
  zoom: number
}

export type EditorSessionState = {
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
  textSettings: TextSettingsState
}

export const DEFAULT_EDITOR_SESSION: EditorSessionState = {
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
  textSettings: {
    text: 'Default Text',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: 48,
    fontWeight: 400,
    italic: false,
    underline: false,
    color: '#ffffff',
  },
}
