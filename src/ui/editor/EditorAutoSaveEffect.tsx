import { useEffect, useEffectEvent } from 'react'
import { LayerPositionDraftState, LayerSizeDraftState, PasteSizeDraftState, SelectionDraftState } from './editorSession'
import { HasUnsavedChangesStoreActions, autosaveTimeoutRef, isHydratingProjectRef } from './editorPersistenceState'
import {
  useCanvasDraftStoreValue,
  useCustomVariablesStoreValue,
  useHighlightSettingsStoreValue,
  useMovementStepStoreValue,
  useShapeSettingsStoreValue,
  useToolStoreValue,
} from './editorSimpleStores'
import { EditorDocument, HistoryEntry } from './types'

type EditorAutoSaveEffectProps = {
  documentState: EditorDocument | null
  history: { past: HistoryEntry[]; future: HistoryEntry[] }
  interactionActive: boolean
  layerPositionDraft: LayerPositionDraftState | null
  layerSizeDraft: LayerSizeDraftState | null
  pasteSizeDraft: PasteSizeDraftState
  projectName: string
  projectPath: string | null
  saveProjectToPath: (projectPath: string) => Promise<void>
  selectionDraft: SelectionDraftState | null
}

export function EditorAutoSaveEffect({
  documentState,
  history,
  interactionActive,
  layerPositionDraft,
  layerSizeDraft,
  pasteSizeDraft,
  projectName,
  projectPath,
  saveProjectToPath,
  selectionDraft,
}: EditorAutoSaveEffectProps) {
  const movementStep = useMovementStepStoreValue()
  const tool = useToolStoreValue()
  const shapeSettings = useShapeSettingsStoreValue()
  const canvasDraft = useCanvasDraftStoreValue()
  const customVariables = useCustomVariablesStoreValue()
  const highlightSettings = useHighlightSettingsStoreValue()
  const saveProject = useEffectEvent((nextProjectPath: string) => {
    void saveProjectToPath(nextProjectPath)
  })

  useEffect(() => {
    if (isHydratingProjectRef.current) {
      isHydratingProjectRef.current = false
      return
    }

    HasUnsavedChangesStoreActions(true)

    if (interactionActive || !projectPath) return

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current)
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      saveProject(projectPath)
    }, 700)

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current)
      }
    }
  }, [
    canvasDraft,
    customVariables,
    documentState,
    highlightSettings,
    history,
    interactionActive,
    layerPositionDraft,
    layerSizeDraft,
    movementStep,
    pasteSizeDraft,
    projectName,
    projectPath,
    selectionDraft,
    shapeSettings,
    tool,
  ])

  return null
}
