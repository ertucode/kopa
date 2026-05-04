import { useEffect, useEffectEvent } from 'react'
import { useDocumentStateStoreValue, useHistoryStoreValue } from './editorCoreStores'
import { autosaveTimeoutRef, isHydratingProjectRef, updateHasUnsavedChangesStoreValue } from './editorPersistenceState'
import {
  useCanvasDraftStoreValue,
  useCustomVariablesStoreValue,
  useHighlightSettingsStoreValue,
  useLayerPositionDraftStoreValue,
  useLayerSizeDraftStoreValue,
  useMovementStepStoreValue,
  usePasteSizeDraftStoreValue,
  useSelectionDraftStoreValue,
  useShapeSettingsStoreValue,
  useToolStoreValue,
} from './editorSimpleStores'

type EditorAutoSaveEffectProps = {
  interactionActive: boolean
  projectName: string
  projectPath: string | null
  saveProjectToPath: (projectPath: string) => Promise<void>
}

export function EditorAutoSaveEffect({
  interactionActive,
  projectName,
  projectPath,
  saveProjectToPath,
}: EditorAutoSaveEffectProps) {
  const documentState = useDocumentStateStoreValue()
  const history = useHistoryStoreValue()
  const movementStep = useMovementStepStoreValue()
  const tool = useToolStoreValue()
  const shapeSettings = useShapeSettingsStoreValue()
  const canvasDraft = useCanvasDraftStoreValue()
  const customVariables = useCustomVariablesStoreValue()
  const highlightSettings = useHighlightSettingsStoreValue()
  const layerPositionDraft = useLayerPositionDraftStoreValue()
  const layerSizeDraft = useLayerSizeDraftStoreValue()
  const pasteSizeDraft = usePasteSizeDraftStoreValue()
  const selectionDraft = useSelectionDraftStoreValue()
  const saveProject = useEffectEvent((nextProjectPath: string) => {
    void saveProjectToPath(nextProjectPath)
  })

  useEffect(() => {
    if (isHydratingProjectRef.current) {
      isHydratingProjectRef.current = false
      return
    }

    updateHasUnsavedChangesStoreValue(true)

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
