import {
  LayerPositionDraftState,
  LayerSizeDraftState,
  PasteSizeDraftState,
  SelectionDraftState,
} from './editorSession'

export type PendingDraftSyncState = {
  layerPosition: LayerPositionDraftState | null
  layerSize: LayerSizeDraftState | null
  selection: SelectionDraftState | null
  pasteSize: PasteSizeDraftState | null
}

export const pendingDraftSyncRef: { current: PendingDraftSyncState } = {
  current: {
    layerPosition: null,
    layerSize: null,
    selection: null,
    pasteSize: null,
  },
}
