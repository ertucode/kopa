import { createUseDerivedStoreValue } from '@/lib/functions/storeHelpers'
import { useSelector } from '@xstate/store-react'
import { ExpressionVariables, parseRoundedMathExpression, resolveCustomVariables } from '../utils/customVariableUtils'
import { DocumentStateStore } from './editorCoreStores'
import {
  CustomVariablesStore,
  MovementStepDraftStore,
  MovementStepStore,
} from './editorSimpleStores'
import { EditorDocument, EditorLayer, HighlightLayer, ShapeLayer, TextLayer } from './types'

function getActiveLayer(documentState: EditorDocument | null): EditorLayer | null {
  if (!documentState?.activeLayerId) return null
  return documentState.layers.find(layer => layer.id === documentState.activeLayerId) ?? null
}

function isHighlightLayer(layer: EditorLayer | null): layer is HighlightLayer {
  return layer?.type === 'highlight'
}

function isShapeLayer(layer: EditorLayer | null): layer is ShapeLayer {
  return layer?.type === 'shape'
}

function isTextLayer(layer: EditorLayer | null): layer is TextLayer {
  return layer?.type === 'text'
}

export function useActiveLayerValue() {
  return useSelector(DocumentStateStore, snapshot => getActiveLayer(snapshot.context.value))
}

export function useActiveHighlightValue() {
  return useSelector(DocumentStateStore, snapshot => {
    const activeLayer = getActiveLayer(snapshot.context.value)
    return isHighlightLayer(activeLayer) ? activeLayer : null
  })
}

export function useActiveShapeValue() {
  return useSelector(DocumentStateStore, snapshot => {
    const activeLayer = getActiveLayer(snapshot.context.value)
    return isShapeLayer(activeLayer) ? activeLayer : null
  })
}

export function useActiveTextValue() {
  return useSelector(DocumentStateStore, snapshot => {
    const activeLayer = getActiveLayer(snapshot.context.value)
    return isTextLayer(activeLayer) ? activeLayer : null
  })
}

const [useCanvasExpressionVariablesValue] = createUseDerivedStoreValue(
  [DocumentStateStore] as const,
  ([documentState]) => [documentState.value?.width, documentState.value?.height],
  ([documentState]): ExpressionVariables => ({
    canvasWidth: documentState.value?.width ?? 0,
    canvasHeight: documentState.value?.height ?? 0,
  })
)

const [useResolvedCustomVariablesValue] = createUseDerivedStoreValue(
  [DocumentStateStore, CustomVariablesStore] as const,
  ([documentState, customVariables]) => [documentState.value?.width, documentState.value?.height, customVariables.value],
  ([documentState, customVariables]) =>
    resolveCustomVariables(customVariables.value, {
      canvasWidth: documentState.value?.width ?? 0,
      canvasHeight: documentState.value?.height ?? 0,
    })
)

const [useResolvedExpressionVariablesValue] = createUseDerivedStoreValue(
  [DocumentStateStore, CustomVariablesStore] as const,
  ([documentState, customVariables]) => [documentState.value?.width, documentState.value?.height, customVariables.value],
  ([documentState, customVariables]): ExpressionVariables =>
    resolveCustomVariables(customVariables.value, {
      canvasWidth: documentState.value?.width ?? 0,
      canvasHeight: documentState.value?.height ?? 0,
    }).variables
)

const [useActiveLayerExpressionVariablesValue] = createUseDerivedStoreValue(
  [DocumentStateStore, CustomVariablesStore] as const,
  ([documentState, customVariables]) => [documentState.value, customVariables.value],
  ([documentState, customVariables]): ExpressionVariables => {
    const resolvedVariables = resolveCustomVariables(customVariables.value, {
      canvasWidth: documentState.value?.width ?? 0,
      canvasHeight: documentState.value?.height ?? 0,
    }).variables
    const activeLayer = getActiveLayer(documentState.value)

    return {
      ...resolvedVariables,
      imageX: activeLayer?.x ?? 0,
      imageY: activeLayer?.y ?? 0,
      imageWidth: activeLayer?.width ?? 0,
      imageHeight: activeLayer?.height ?? 0,
    }
  }
)

const [useSelectionExpressionVariablesValue] = createUseDerivedStoreValue(
  [DocumentStateStore, CustomVariablesStore] as const,
  ([documentState, customVariables]) => [documentState.value, customVariables.value],
  ([documentState, customVariables]): ExpressionVariables => {
    const resolvedVariables = resolveCustomVariables(customVariables.value, {
      canvasWidth: documentState.value?.width ?? 0,
      canvasHeight: documentState.value?.height ?? 0,
    }).variables
    const selection = documentState.value?.selection

    return {
      ...resolvedVariables,
      selectionX: selection?.x ?? 0,
      selectionY: selection?.y ?? 0,
      selectionWidth: selection?.width ?? 0,
      selectionHeight: selection?.height ?? 0,
    }
  }
)

const [useNormalizedMovementStepValue] = createUseDerivedStoreValue(
  [DocumentStateStore, CustomVariablesStore, MovementStepStore] as const,
  ([documentState, customVariables, movementStep]) => [documentState.value, customVariables.value, movementStep.value],
  ([documentState, customVariables, movementStep]) => {
    const resolvedVariables = resolveCustomVariables(customVariables.value, {
      canvasWidth: documentState.value?.width ?? 0,
      canvasHeight: documentState.value?.height ?? 0,
    }).variables

    return Math.max(1, parseRoundedMathExpression(movementStep.value, resolvedVariables) ?? 1)
  }
)

const [useNormalizedMovementStepDraftValue] = createUseDerivedStoreValue(
  [DocumentStateStore, CustomVariablesStore, MovementStepDraftStore] as const,
  ([documentState, customVariables, movementStepDraft]) => [
    documentState.value,
    customVariables.value,
    movementStepDraft.value,
  ],
  ([documentState, customVariables, movementStepDraft]) => {
    const resolvedVariables = resolveCustomVariables(customVariables.value, {
      canvasWidth: documentState.value?.width ?? 0,
      canvasHeight: documentState.value?.height ?? 0,
    }).variables

    return Math.max(1, parseRoundedMathExpression(movementStepDraft.value, resolvedVariables) ?? 1)
  }
)

export {
  useCanvasExpressionVariablesValue,
  useResolvedCustomVariablesValue,
  useResolvedExpressionVariablesValue,
  useActiveLayerExpressionVariablesValue,
  useSelectionExpressionVariablesValue,
  useNormalizedMovementStepValue,
  useNormalizedMovementStepDraftValue,
}
