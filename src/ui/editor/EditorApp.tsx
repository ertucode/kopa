import { useEffect, useMemo, useRef } from 'react'
import useMeasure from 'react-use-measure'
import { ContextMenu, ContextMenuList, useContextMenu } from '@/lib/components/context-menu'
import { useShortcuts } from '@/lib/hooks/useShortcuts'
import { getWindowElectron, windowArgs } from '@/getWindowElectron'
import { pointInRect, snapToStep } from '@common/TransformUtils'
import { createLayerFromDataUrl, createLayerFromFile, loadImageElement, readFileAsDataUrl } from './raster'
import { drawTextLayer } from './textUtils'
import { EditorDocument } from './types'
import { drawShapeLayer } from './shapeUtils'
import { drawHighlightLayer } from './highlightUtils'
import { parseRoundedMathExpression, resolveCustomVariables } from '../utils/customVariableUtils'
import {
  clampSelectionToDocument,
  cloneLayer,
  cloneDocument,
  getLayerRect,
  hitLayer,
  isHighlightLayer,
  isImageLayer,
  isShapeLayer,
  isTextLayer,
} from '../utils/documentUtils'
import {
  beginHighlightCreation,
  beginLayerMove,
  beginResize,
  beginSelectionCreation,
  beginShapeCreation,
  beginTextCreation,
  cancelInteraction,
  finalizeInteraction,
  finishSelectionMove,
  startSelectionMove,
  updateHighlightCreation,
  updateLayerMove,
  updateLayerResize,
  updateSelectionCreation,
  updateSelectionMove,
  updateShapeCreation,
} from './interactionUtils'
import {
  useCanvasDraftStore,
  useLayerPositionDraftStore,
  useLayerSizeDraftStore,
  usePasteSizeDraftStore,
  useSelectionDraftStore,
  updateImagePreviewDialogStoreValue,
  useMovementStepStore,
  updateErrorMessageStoreValue,
  updateInteractionStoreValue,
  updateSelectionPreviewStoreValue,
  useSelectionPreviewStoreValue,
  useImageRevisionStore,
  updateMovementStepStoreValue,
  getToolStoreValue,
  updateToolStoreValue,
  useToolStoreValue,
  useCustomVariablesStoreValue,
  getMovementStepDraftStoreValue,
  getIsSavingStoreValue,
  updateIsSavingStoreValue,
  updateImageRevisionStoreValue,
  getInteractionStoreValue,
} from './editorSimpleStores'
import { getDocumentStateStoreValue, updateHistoryStoreValue, useDocumentStateStore } from './editorCoreStores'
import {
  useActiveLayerValue,
  useNormalizedMovementStepDraftValue,
  useNormalizedMovementStepValue,
  useResolvedCustomVariablesValue,
  useResolvedExpressionVariablesValue,
  useSelectionExpressionVariablesValue,
} from './editorDerivedValues'
import { pendingDraftSyncRef } from './editorDraftSyncState'
import { ShapeToolSection } from './ShapeToolSection'
import { EditorAutoSaveEffect } from './EditorAutoSaveEffect'
import { HighlightToolSection } from './HighlightToolSection'
import { ImagePreviewDialog } from './ImagePreviewDialog'
import { EditorErrorDialog } from './EditorErrorDialog'
import { SelectionSection } from './SelectionSection'
import { TextToolSection } from './TextToolSection'
import { DocumentSettingsSection } from './DocumentSettingsSection'
import { ActiveLayerInspectorSection } from './ActiveLayerInspectorSection'
import { EditorFooter } from './EditorFooter'
import { EditorToolBarSection } from './EditorToolBarSection'
import { EmptyProjectState } from './EmptyProjectState'
import { ObjectsListSection } from './ObjectsListSection'
import { ProjectSection } from './ProjectSection'
import { VariablesSection } from './VariablesSection'
import { findHandle, getHandles, getPointerOnCanvas } from './editorCanvasUtils'
import { imageCache } from './editorImageCache'
import {
  applyProjectName,
  createNewDocument,
  handleOpenProject,
  handleOpenRecentProject,
  handleSaveProject,
  openProjectFromPath,
  pushHistory,
  refreshRecentProjects,
  saveProjectToPath,
  setCanvasSize,
  startNewProjectFromImage,
} from './editorActions'

type CanvasContextMenuItem =
  | {
      type: 'layer'
      layerId: string
    }
  | {
      type: 'selection'
      layerId: string | null
    }

export function EditorApp() {
  const [documentState, setDocumentState] = useDocumentStateStore()
  const tool = useToolStoreValue()
  const selectionPreview = useSelectionPreviewStoreValue()
  const [canvasDraft, setCanvasDraft] = useCanvasDraftStore()
  const [pasteSizeDraft, setPasteSizeDraft] = usePasteSizeDraftStore()
  const [movementStep, setMovementStep] = useMovementStepStore()
  const customVariables = useCustomVariablesStoreValue()
  const [layerPositionDraft, setLayerPositionDraft] = useLayerPositionDraftStore()
  const [layerSizeDraft, setLayerSizeDraft] = useLayerSizeDraftStore()
  const [selectionDraft, setSelectionDraft] = useSelectionDraftStore()
  const [viewportRef, viewportBounds] = useMeasure()
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const [imageRevision, _] = useImageRevisionStore()

  const activeLayer = useActiveLayerValue()
  const resolvedCustomVariables = useResolvedCustomVariablesValue()
  const resolvedExpressionVariables = useResolvedExpressionVariablesValue()
  const selectionExpressionVariables = useSelectionExpressionVariablesValue()

  function applyMovementStep() {
    const movementStepVariables = documentState
      ? resolveCustomVariables(customVariables, {
          canvasWidth: documentState.width,
          canvasHeight: documentState.height,
        }).variables
      : resolvedExpressionVariables
    const movementStepDraft = getMovementStepDraftStoreValue()
    const parsedMovementStep = parseRoundedMathExpression(movementStepDraft, movementStepVariables)
    const nextMovementStep = Math.max(1, parsedMovementStep ?? Number.NaN)
    if (!Number.isFinite(nextMovementStep)) {
      updateErrorMessageStoreValue('Movement step must be a valid number or math expression')
      return
    }
    updateMovementStepStoreValue(String(nextMovementStep))
  }

  function applyCustomVariables() {
    if (Object.keys(resolvedCustomVariables.errors).length > 0) {
      updateErrorMessageStoreValue('Fix variable errors before applying them')
      return
    }

    let nextDocument = documentState ? cloneDocument(documentState) : null
    let didDocumentChange = false

    if (nextDocument) {
      const nextCanvasVariables = resolveCustomVariables(customVariables, {
        canvasWidth: nextDocument.width,
        canvasHeight: nextDocument.height,
      }).variables
      const nextWidth = parseRoundedMathExpression(canvasDraft.width, nextCanvasVariables)
      const nextHeight = parseRoundedMathExpression(canvasDraft.height, nextCanvasVariables)
      if (nextWidth !== null && nextHeight !== null && Number.isFinite(nextWidth) && Number.isFinite(nextHeight)) {
        const width = Math.max(1, nextWidth)
        const height = Math.max(1, nextHeight)
        if (width !== nextDocument.width || height !== nextDocument.height) {
          nextDocument.width = width
          nextDocument.height = height
          didDocumentChange = true
        }
      }

      const resolvedVariables = resolveCustomVariables(customVariables, {
        canvasWidth: nextDocument.width,
        canvasHeight: nextDocument.height,
      }).variables

      const parsedPasteWidth = pasteSizeDraft.width.trim().length
        ? parseRoundedMathExpression(pasteSizeDraft.width, resolvedVariables)
        : null
      const parsedPasteHeight = pasteSizeDraft.height.trim().length
        ? parseRoundedMathExpression(pasteSizeDraft.height, resolvedVariables)
        : null
      const nextPasteWidth = parsedPasteWidth === null ? null : Math.max(1, parsedPasteWidth)
      const nextPasteHeight = parsedPasteHeight === null ? null : Math.max(1, parsedPasteHeight)
      if (nextPasteWidth !== nextDocument.pasteWidth || nextPasteHeight !== nextDocument.pasteHeight) {
        nextDocument.pasteWidth = nextPasteWidth
        nextDocument.pasteHeight = nextPasteHeight
        didDocumentChange = true
      }

      if (layerPositionDraft) {
        const layer = nextDocument.layers.find(item => item.id === layerPositionDraft.layerId)
        if (layer) {
          const layerVariables = {
            ...resolvedVariables,
            imageX: layer.x,
            imageY: layer.y,
            imageWidth: layer.width,
            imageHeight: layer.height,
          }
          const parsedX = parseRoundedMathExpression(layerPositionDraft.x, layerVariables)
          const parsedY = parseRoundedMathExpression(layerPositionDraft.y, layerVariables)
          const nextX = snapToStep(parsedX ?? Number.NaN, normalizedMovementStep)
          const nextY = snapToStep(parsedY ?? Number.NaN, normalizedMovementStep)
          if (Number.isFinite(nextX) && Number.isFinite(nextY) && (nextX !== layer.x || nextY !== layer.y)) {
            layer.x = nextX
            layer.y = nextY
            didDocumentChange = true
          }
        }
      }

      if (layerSizeDraft) {
        const layer = nextDocument.layers.find(item => item.id === layerSizeDraft.layerId)
        if (layer && !isHighlightLayer(layer) && !isTextLayer(layer)) {
          const layerVariables = {
            ...resolvedVariables,
            imageX: layer.x,
            imageY: layer.y,
            imageWidth: layer.width,
            imageHeight: layer.height,
          }
          let nextWidth = Math.max(1, parseRoundedMathExpression(layerSizeDraft.width, layerVariables) ?? Number.NaN)
          let nextHeight = Math.max(1, parseRoundedMathExpression(layerSizeDraft.height, layerVariables) ?? Number.NaN)
          if (
            isShapeLayer(layer) &&
            layer.shape === 'circle' &&
            Number.isFinite(nextWidth) &&
            Number.isFinite(nextHeight)
          ) {
            const size = Math.max(nextWidth, nextHeight)
            nextWidth = size
            nextHeight = size
          }
          if (
            Number.isFinite(nextWidth) &&
            Number.isFinite(nextHeight) &&
            (nextWidth !== layer.width || nextHeight !== layer.height)
          ) {
            layer.width = nextWidth
            layer.height = nextHeight
            didDocumentChange = true
          }
        }
      }

      if (nextDocument.selection && selectionDraft) {
        const selectionVariables = {
          ...resolvedVariables,
          selectionX: nextDocument.selection.x,
          selectionY: nextDocument.selection.y,
          selectionWidth: nextDocument.selection.width,
          selectionHeight: nextDocument.selection.height,
        }
        const nextSelection = clampSelectionToDocument(
          {
            x: parseRoundedMathExpression(selectionDraft.x, selectionVariables) ?? nextDocument.selection.x,
            y: parseRoundedMathExpression(selectionDraft.y, selectionVariables) ?? nextDocument.selection.y,
            width: Math.max(
              1,
              parseRoundedMathExpression(selectionDraft.width, selectionVariables) ?? nextDocument.selection.width
            ),
            height: Math.max(
              1,
              parseRoundedMathExpression(selectionDraft.height, selectionVariables) ?? nextDocument.selection.height
            ),
          },
          nextDocument
        )

        if (JSON.stringify(nextSelection) !== JSON.stringify(nextDocument.selection)) {
          nextDocument.selection = nextSelection
          didDocumentChange = true
        }
      } else if (nextDocument.selection) {
        const clampedSelection = clampSelectionToDocument(nextDocument.selection, nextDocument)
        if (JSON.stringify(clampedSelection) !== JSON.stringify(nextDocument.selection)) {
          nextDocument.selection = clampedSelection
          didDocumentChange = true
        }
      }
    }

    const movementStepDraft = getMovementStepDraftStoreValue()
    const parsedMovementStep = parseRoundedMathExpression(movementStepDraft, resolvedExpressionVariables)
    const nextMovementStep = parsedMovementStep === null ? null : Math.max(1, parsedMovementStep)
    const didMovementStepChange = nextMovementStep !== null && String(nextMovementStep) !== movementStep

    pendingDraftSyncRef.current = {
      layerPosition: layerPositionDraft,
      layerSize: layerSizeDraft,
      selection: selectionDraft,
      pasteSize: pasteSizeDraft,
    }

    if (didMovementStepChange) {
      setMovementStep(String(nextMovementStep))
    }
    if (documentState && nextDocument && didDocumentChange) {
      pushHistory('Apply variables', documentState, nextDocument)
    }
  }

  useEffect(() => {
    void refreshRecentProjects()

    if (windowArgs.initialPath) {
      void openProjectFromPath(windowArgs.initialPath)
    }
  }, [])

  useEffect(() => {
    if (!activeLayer) {
      setLayerPositionDraft(null)
      setLayerSizeDraft(null)
      return
    }

    setLayerPositionDraft(current => {
      const pendingDraft = pendingDraftSyncRef.current.layerPosition
      if (pendingDraft?.layerId === activeLayer.id) {
        pendingDraftSyncRef.current.layerPosition = null
        return pendingDraft
      }

      if (
        current?.layerId === activeLayer.id &&
        current.x === String(Math.round(activeLayer.x)) &&
        current.y === String(Math.round(activeLayer.y))
      ) {
        return current
      }

      return {
        layerId: activeLayer.id,
        x: String(Math.round(activeLayer.x)),
        y: String(Math.round(activeLayer.y)),
      }
    })

    setLayerSizeDraft(current => {
      if (isHighlightLayer(activeLayer) || isTextLayer(activeLayer)) {
        return null
      }

      const pendingDraft = pendingDraftSyncRef.current.layerSize
      if (pendingDraft?.layerId === activeLayer.id) {
        pendingDraftSyncRef.current.layerSize = null
        return pendingDraft
      }

      if (
        current?.layerId === activeLayer.id &&
        current.width === String(Math.round(activeLayer.width)) &&
        current.height === String(Math.round(activeLayer.height))
      ) {
        return current
      }

      return {
        layerId: activeLayer.id,
        width: String(Math.round(activeLayer.width)),
        height: String(Math.round(activeLayer.height)),
      }
    })
  }, [activeLayer])

  useEffect(() => {
    if (!documentState?.selection) {
      setSelectionDraft(null)
      return
    }

    const selection = documentState.selection

    setSelectionDraft(current => {
      const pendingDraft = pendingDraftSyncRef.current.selection
      if (pendingDraft) {
        pendingDraftSyncRef.current.selection = null
        return pendingDraft
      }

      const nextDraft = {
        x: String(Math.round(selection.x)),
        y: String(Math.round(selection.y)),
        width: String(Math.round(selection.width)),
        height: String(Math.round(selection.height)),
      }

      if (
        current &&
        current.x === nextDraft.x &&
        current.y === nextDraft.y &&
        current.width === nextDraft.width &&
        current.height === nextDraft.height
      ) {
        return current
      }

      return nextDraft
    })
  }, [documentState?.selection])

  useEffect(() => {
    if (!documentState) return

    const pendingDraft = pendingDraftSyncRef.current.pasteSize
    if (pendingDraft) {
      pendingDraftSyncRef.current.pasteSize = null
      setPasteSizeDraft(pendingDraft)
      return
    }

    setPasteSizeDraft({
      width: documentState.pasteWidth === null ? '' : String(documentState.pasteWidth),
      height: documentState.pasteHeight === null ? '' : String(documentState.pasteHeight),
    })
  }, [documentState?.pasteHeight, documentState?.pasteWidth])

  const normalizedMovementStep = useNormalizedMovementStepValue()
  const normalizedMovementStepDraft = useNormalizedMovementStepDraftValue()

  const viewportScale = useMemo(() => {
    if (!documentState) return 1
    if (!viewportBounds.width || !viewportBounds.height) return 1
    return Math.max(
      0.05,
      Math.min(
        (viewportBounds.width - 48) / documentState.width,
        (viewportBounds.height - 48) / documentState.height,
        1
      )
    )
  }, [documentState, viewportBounds.height, viewportBounds.width])

  const transparentCanvasStyle =
    documentState?.background === 'transparent'
      ? {
          backgroundColor: '#ffffff',
          backgroundImage:
            'linear-gradient(45deg, rgba(17,20,27,0.15) 25%, transparent 25%), linear-gradient(-45deg, rgba(17,20,27,0.15) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(17,20,27,0.15) 75%), linear-gradient(-45deg, transparent 75%, rgba(17,20,27,0.15) 75%)',
          backgroundPosition: '0 0, 0 20px, 20px -20px, -20px 0px',
          backgroundSize: '40px 40px',
        }
      : null

  useEffect(() => {
    if (!documentState) return
    let cancelled = false
    const currentDocumentState = documentState

    async function ensureImages() {
      const urls = new Set(currentDocumentState.layers.filter(isImageLayer).map(layer => layer.dataUrl))
      if (selectionPreview) {
        urls.add(selectionPreview.floatingDataUrl)
      }

      const loads = Array.from(urls).map(async url => {
        if (imageCache.has(url)) return
        const image = await loadImageElement(url)
        if (!cancelled) {
          imageCache.set(url, image)
        }
      })

      await Promise.all(loads)
      if (!cancelled) {
        updateImageRevisionStoreValue(revision => revision + 1)
      }
    }

    void ensureImages()
    return () => {
      cancelled = true
    }
  }, [documentState, selectionPreview])

  useEffect(() => {
    const mainCanvas = mainCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    if (!mainCanvas || !overlayCanvas || !documentState) return

    mainCanvas.width = documentState.width
    mainCanvas.height = documentState.height
    overlayCanvas.width = documentState.width
    overlayCanvas.height = documentState.height

    const mainContext = mainCanvas.getContext('2d')
    const overlayContext = overlayCanvas.getContext('2d')
    if (!mainContext || !overlayContext) return

    mainContext.clearRect(0, 0, documentState.width, documentState.height)
    mainContext.fillStyle = documentState.background
    mainContext.fillRect(0, 0, documentState.width, documentState.height)

    for (const layer of documentState.layers) {
      if (!layer.visible) continue
      if (isHighlightLayer(layer)) {
        drawHighlightLayer(mainContext, layer)
        continue
      }
      if (isShapeLayer(layer)) {
        drawShapeLayer(mainContext, layer)
        continue
      }
      if (isTextLayer(layer)) {
        drawTextLayer(mainContext, layer)
        continue
      }
      const image = imageCache.get(layer.dataUrl)
      if (!image) continue
      mainContext.save()
      mainContext.globalAlpha = layer.opacity
      mainContext.imageSmoothingEnabled = true
      mainContext.drawImage(image, layer.x, layer.y, layer.width, layer.height)
      mainContext.restore()
    }

    if (selectionPreview) {
      const floatingImage = imageCache.get(selectionPreview.floatingDataUrl)
      if (floatingImage) {
        const rect = selectionPreview.selection
        mainContext.drawImage(floatingImage, rect.x, rect.y, rect.width, rect.height)
      }
    }

    overlayContext.clearRect(0, 0, documentState.width, documentState.height)

    if (activeLayer) {
      const layerRect = getLayerRect(activeLayer)
      overlayContext.save()
      overlayContext.strokeStyle = '#5f9dff'
      overlayContext.lineWidth = 1.5
      overlayContext.setLineDash([8, 4])
      overlayContext.strokeRect(layerRect.x, layerRect.y, layerRect.width, layerRect.height)
      overlayContext.restore()

      if (tool === 'select' && isImageLayer(activeLayer)) {
        for (const { rect } of getHandles(activeLayer)) {
          overlayContext.fillStyle = '#f7f8fb'
          overlayContext.strokeStyle = '#245cff'
          overlayContext.lineWidth = 1
          overlayContext.fillRect(rect.x, rect.y, rect.width, rect.height)
          overlayContext.strokeRect(rect.x, rect.y, rect.width, rect.height)
        }
      }
    }

    if (documentState.selection) {
      const selectionRect = documentState.selection
      overlayContext.save()
      overlayContext.fillStyle = 'rgba(95, 157, 255, 0.12)'
      overlayContext.strokeStyle = '#8fc7ff'
      overlayContext.lineWidth = 1
      overlayContext.setLineDash([5, 3])
      overlayContext.fillRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height)
      overlayContext.strokeRect(selectionRect.x, selectionRect.y, selectionRect.width, selectionRect.height)
      overlayContext.restore()
    }
  }, [activeLayer, documentState, imageRevision, selectionPreview, tool])

  function applyPasteSize(widthValue: string, heightValue: string) {
    if (!documentState) return

    const hasWidth = widthValue.trim().length > 0
    const hasHeight = heightValue.trim().length > 0
    const parsedWidth = hasWidth ? parseRoundedMathExpression(widthValue, resolvedExpressionVariables) : null
    const parsedHeight = hasHeight ? parseRoundedMathExpression(heightValue, resolvedExpressionVariables) : null
    const pasteWidth = parsedWidth === null ? null : Math.max(1, parsedWidth)
    const pasteHeight = parsedHeight === null ? null : Math.max(1, parsedHeight)
    if ((hasWidth && pasteWidth === null) || (hasHeight && pasteHeight === null)) {
      updateErrorMessageStoreValue(
        'Paste width and height must be valid numbers or simple math expressions when provided'
      )
      return
    }
    if ((hasWidth && !Number.isFinite(pasteWidth)) || (hasHeight && !Number.isFinite(pasteHeight))) {
      updateErrorMessageStoreValue(
        'Paste width and height must be valid numbers or simple math expressions when provided'
      )
      return
    }

    pendingDraftSyncRef.current.pasteSize = { width: widthValue, height: heightValue }
    setDocumentState({
      ...documentState,
      pasteWidth,
      pasteHeight,
    })
  }

  async function importFiles(files: FileList | File[]) {
    if (!documentState) return
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (!imageFiles.length) return

    try {
      let nextDocument = cloneDocument(documentState)
      for (const file of imageFiles) {
        const layer = await createLayerFromFile(file, nextDocument)
        nextDocument = {
          ...nextDocument,
          layers: [...nextDocument.layers, layer],
          activeLayerId: layer.id,
          selection: null,
        }
      }
      pushHistory(imageFiles.length > 1 ? 'Place images' : 'Place image', documentState, nextDocument)
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to import image')
    }
  }

  async function importImageData(files: Array<{ name: string; dataUrl: string }>) {
    if (!documentState) return
    if (files.length === 0) return

    try {
      let nextDocument = cloneDocument(documentState)
      for (const file of files) {
        const layer = await createLayerFromDataUrl(file.name, file.dataUrl, nextDocument)
        nextDocument = {
          ...nextDocument,
          layers: [...nextDocument.layers, layer],
          activeLayerId: layer.id,
          selection: null,
        }
      }
      pushHistory(files.length > 1 ? 'Place images' : 'Place image', documentState, nextDocument)
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to import image')
    }
  }

  async function createProjectFromImageData(name: string, dataUrl: string) {
    try {
      await startNewProjectFromImage(name, dataUrl)
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to create project from image')
    }
  }

  async function createProjectFromFile(file: File) {
    try {
      const dataUrl = await readFileAsDataUrl(file)
      await createProjectFromImageData(file.name, dataUrl)
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to create project from image')
    }
  }

  function shouldHandlePasteTarget(target: EventTarget | null) {
    if (target instanceof HTMLInputElement) return false
    if (target instanceof HTMLTextAreaElement) return false
    if (target instanceof HTMLSelectElement) return false
    if (target instanceof HTMLElement && target.isContentEditable) return false
    return true
  }

  function getClipboardImageExtension(mimeType: string) {
    const extension = mimeType.split('/')[1]?.toLowerCase()
    if (!extension) return 'png'
    if (extension === 'jpeg') return 'jpg'
    return extension
  }

  async function getClipboardImageFiles() {
    if (!navigator.clipboard?.read) return [] as File[]

    const clipboardItems = await navigator.clipboard.read()
    const files: File[] = []

    for (const [index, clipboardItem] of clipboardItems.entries()) {
      const imageType = clipboardItem.types.find(type => type.startsWith('image/'))
      if (!imageType) continue

      const blob = await clipboardItem.getType(imageType)
      files.push(
        new File([blob], `clipboard-image-${index + 1}.${getClipboardImageExtension(imageType)}`, {
          type: imageType,
        })
      )
    }

    return files
  }

  async function createProjectFromClipboard() {
    try {
      const files = await getClipboardImageFiles()
      if (!files.length) return
      await createProjectFromFile(files[0])
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to create project from clipboard')
    }
  }

  async function createProjectFromImageFileSystem() {
    try {
      const response = await getWindowElectron().openEditorImageFiles()
      if (response.canceled || response.files.length === 0) return
      const file = response.files[0]
      await createProjectFromImageData(file.name, file.dataUrl)
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to create project from image')
    }
  }

  async function pasteImageFromClipboard() {
    if (!documentState) return

    try {
      const files = await getClipboardImageFiles()
      if (!files.length) return
      await importFiles(files)
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to paste image')
    }
  }

  function deleteLayer(layerId: string) {
    if (!documentState) return
    const layerIndex = documentState.layers.findIndex(layer => layer.id === layerId)
    if (layerIndex === -1) return

    const nextLayers = documentState.layers.filter(layer => layer.id !== layerId)
    const nextActiveLayerId =
      documentState.activeLayerId === layerId
        ? (nextLayers[Math.min(layerIndex, nextLayers.length - 1)]?.id ?? null)
        : documentState.activeLayerId

    const nextDocument: EditorDocument = {
      ...documentState,
      layers: nextLayers,
      activeLayerId: nextActiveLayerId,
      selection: documentState.selection,
    }

    pushHistory('Delete object', documentState, nextDocument)
  }

  function handleUndo() {
    updateHistoryStoreValue(currentHistory => {
      const currentDocumentState = getDocumentStateStoreValue()
      const previousEntry = currentHistory.past[currentHistory.past.length - 1]
      if (!previousEntry || !currentDocumentState) return currentHistory
      setDocumentState(previousEntry.document)
      updateInteractionStoreValue(null)
      updateSelectionPreviewStoreValue(null)
      return {
        past: currentHistory.past.slice(0, -1),
        future: [
          { label: previousEntry.label, document: cloneDocument(currentDocumentState) },
          ...currentHistory.future,
        ],
      }
    })
  }

  function handleRedo() {
    updateHistoryStoreValue(currentHistory => {
      const currentDocumentState = getDocumentStateStoreValue()
      const [nextEntry, ...remainingFuture] = currentHistory.future
      if (!nextEntry || !currentDocumentState) return currentHistory
      setDocumentState(nextEntry.document)
      updateInteractionStoreValue(null)
      updateSelectionPreviewStoreValue(null)
      return {
        past: [...currentHistory.past, { label: nextEntry.label, document: cloneDocument(currentDocumentState) }],
        future: remainingFuture,
      }
    })
  }

  function handleSelectWholeCanvas() {
    if (!documentState) return

    updateToolStoreValue('marquee')
    updateInteractionStoreValue(null)
    updateSelectionPreviewStoreValue(null)

    const nextDocument: EditorDocument = {
      ...documentState,
      activeLayerId: null,
      selection: {
        x: 0,
        y: 0,
        width: documentState.width,
        height: documentState.height,
      },
    }

    const selectionUnchanged =
      documentState.activeLayerId === null &&
      documentState.selection?.x === 0 &&
      documentState.selection?.y === 0 &&
      documentState.selection?.width === documentState.width &&
      documentState.selection?.height === documentState.height

    if (selectionUnchanged) return

    pushHistory('Select canvas', documentState, nextDocument)
  }

  useShortcuts([
    {
      code: [
        { code: 'KeyZ', metaKey: true },
        { code: 'KeyZ', ctrlKey: true },
      ],
      handler: () => handleUndo(),
      label: '[Editor] Undo',
    },
    {
      code: [
        { code: 'KeyZ', metaKey: true, shiftKey: true },
        { code: 'KeyZ', ctrlKey: true, shiftKey: true },
      ],
      handler: () => handleRedo(),
      label: '[Editor] Redo',
    },
    {
      code: [
        { code: 'KeyS', metaKey: true },
        { code: 'KeyS', ctrlKey: true },
      ],
      handler: event => {
        event?.preventDefault()
        void saveFinalImage()
      },
      label: '[Editor] Save final image',
    },
    documentState && {
      code: [
        { code: 'KeyA', metaKey: true },
        { code: 'KeyA', ctrlKey: true },
      ],
      handler: event => {
        event?.preventDefault()
        handleSelectWholeCanvas()
      },
      label: '[Editor] Select whole canvas',
    },
    (documentState?.selection || activeLayer) && {
      code: [
        { code: 'KeyC', metaKey: true },
        { code: 'KeyC', ctrlKey: true },
      ],
      handler: event => {
        event?.preventDefault()
        void copyCurrentItemToClipboard()
      },
      label: '[Editor] Copy current item',
    },
    {
      code: [
        { code: 'KeyV', metaKey: true },
        { code: 'KeyV', ctrlKey: true },
      ],
      enabledIn: (event: KeyboardEvent | undefined) => shouldHandlePasteTarget(event?.target ?? null),
      handler: event => {
        event?.preventDefault()
        if (documentState) {
          void pasteImageFromClipboard()
          return
        }

        void createProjectFromClipboard()
      },
      label: '[Editor] Paste image or create project',
    },
    activeLayer && {
      code: ['Backspace', 'Delete'],
      handler: event => {
        event?.preventDefault()
        deleteLayer(activeLayer.id)
      },
      label: '[Editor] Delete selected object',
    },
  ])

  useEffect(() => {
    return getWindowElectron().onGenericEvent(event => {
      if (event.type !== 'editor-action') return

      if (event.action === 'new-project') {
        createNewDocument(1024, 1024)
        return
      }
      if (event.action === 'new-project-from-clipboard') {
        void createProjectFromClipboard()
        return
      }
      if (event.action === 'new-project-from-image') {
        void createProjectFromImageFileSystem()
        return
      }
      if (event.action === 'open-project') {
        void handleOpenProject()
        return
      }
      if (event.action === 'open-recent-project') {
        void handleOpenRecentProject(event.projectPath)
        return
      }
      if (event.action === 'save-project') {
        void handleSaveProject()
        return
      }
      if (event.action === 'save-png') {
        void saveFinalImage()
        return
      }
      return
    })
  }, [documentState, handleOpenProject, handleSaveProject, saveFinalImage])

  useEffect(() => {
    return getWindowElectron().onGenericEvent(event => {
      if (event.type !== 'editor-import-images') return
      void importImageData(event.files)
    })
  }, [documentState])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (!shouldHandlePasteTarget(event.target)) return

      const imageFiles = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'))
      if (!imageFiles.length) return

      event.preventDefault()
      if (!documentState) {
        void createProjectFromFile(imageFiles[0])
        return
      }

      void importFiles(imageFiles)
    }

    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [documentState])

  async function handleCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!documentState) return
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const pointer = getPointerOnCanvas(event, canvas)
    const layer = hitLayer(documentState.layers, pointer)
    canvas.setPointerCapture(event.pointerId)
    const tool = getToolStoreValue()

    if (tool === 'select') {
      if (layer) {
        if (isImageLayer(layer)) {
          const handle = findHandle(layer, pointer)
          if (handle) {
            beginResize(layer, pointer, handle)
            return
          }
        }
        beginLayerMove(layer, pointer)
        return
      }
      setDocumentState({ ...documentState, activeLayerId: null, selection: null })
      return
    }

    if (tool === 'marquee') {
      const currentSelection = documentState.selection
      if (currentSelection && pointInRect(pointer, currentSelection)) {
        await startSelectionMove(currentSelection, pointer)
        return
      }

      beginSelectionCreation(pointer, layer?.id ?? documentState.activeLayerId)
      return
    }

    if (tool === 'highlight') {
      beginHighlightCreation(pointer)
      return
    }

    if (tool === 'shape') {
      beginShapeCreation(pointer)
      return
    }

    if (tool === 'text') {
      beginTextCreation(pointer)
    }
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const interaction = getInteractionStoreValue()
    if (!interaction) return
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const pointer = getPointerOnCanvas(event, canvas)

    if (interaction.type === 'moving-layer') {
      updateLayerMove(pointer)
      return
    }
    if (interaction.type === 'resizing-layer') {
      updateLayerResize(pointer, event.shiftKey)
      return
    }
    if (interaction.type === 'creating-selection') {
      updateSelectionCreation(pointer)
      return
    }
    if (interaction.type === 'creating-highlight') {
      updateHighlightCreation(pointer, event.shiftKey)
      return
    }
    if (interaction.type === 'creating-shape') {
      updateShapeCreation(pointer)
      return
    }
    if (interaction.type === 'moving-selection') {
      updateSelectionMove(pointer)
    }
  }

  async function handleCanvasPointerUp() {
    const interaction = getInteractionStoreValue()
    if (!interaction || !documentState) return
    if (interaction.type === 'moving-layer') {
      const layer = documentState.layers.find(item => item.id === interaction.layerId)
      finalizeInteraction(
        layer?.type === 'highlight'
          ? 'Move highlight'
          : layer?.type === 'shape'
            ? 'Move shape'
            : layer?.type === 'text'
              ? 'Move text'
              : 'Move image'
      )
      return
    }
    if (interaction.type === 'resizing-layer') {
      finalizeInteraction('Resize image')
      return
    }
    if (interaction.type === 'creating-selection') {
      finalizeInteraction('Create selection')
      return
    }
    if (interaction.type === 'creating-highlight') {
      finalizeInteraction('Create highlight')
      return
    }
    if (interaction.type === 'creating-shape') {
      finalizeInteraction('Create shape')
      return
    }
    if (interaction.type === 'moving-selection') {
      finishSelectionMove()
    }
  }

  function handleCanvasPointerCancel() {
    cancelInteraction()
  }

  function openImagePreviewDialog(layerId: string) {
    const layer = documentState?.layers.find(item => item.id === layerId)
    if (!layer || !isImageLayer(layer)) return
    updateImagePreviewDialogStoreValue({
      name: layer.name,
      dataUrl: layer.dataUrl,
      pixelWidth: layer.pixelWidth,
      pixelHeight: layer.pixelHeight,
      zoom: 1,
    })
  }

  function applySelectionPosition() {
    if (!documentState || !documentState.selection || !selectionDraft) return

    const x = parseRoundedMathExpression(selectionDraft.x, selectionExpressionVariables) ?? Number.NaN
    const y = parseRoundedMathExpression(selectionDraft.y, selectionExpressionVariables) ?? Number.NaN
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      updateErrorMessageStoreValue('Selection coordinates must be valid numbers or simple math expressions')
      return
    }

    const nextSelection = clampSelectionToDocument(
      {
        ...documentState.selection,
        x,
        y,
      },
      documentState
    )

    pendingDraftSyncRef.current.selection = selectionDraft
    pushHistory('Set selection position', documentState, {
      ...documentState,
      selection: nextSelection,
    })
  }

  function applySelectionSize() {
    if (!documentState || !documentState.selection || !selectionDraft) return

    const width = Math.max(
      1,
      parseRoundedMathExpression(selectionDraft.width, selectionExpressionVariables) ?? Number.NaN
    )
    const height = Math.max(
      1,
      parseRoundedMathExpression(selectionDraft.height, selectionExpressionVariables) ?? Number.NaN
    )
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      updateErrorMessageStoreValue('Selection width and height must be valid numbers or simple math expressions')
      return
    }

    const nextSelection = clampSelectionToDocument(
      {
        ...documentState.selection,
        width,
        height,
      },
      documentState
    )

    pendingDraftSyncRef.current.selection = selectionDraft
    pushHistory('Set selection size', documentState, {
      ...documentState,
      selection: nextSelection,
    })
  }

  async function copyCanvasToClipboard(canvas: HTMLCanvasElement) {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      updateErrorMessageStoreValue('Image clipboard copy is not available in this environment')
      return
    }

    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) {
        throw new Error('Could not create clipboard image')
      }

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to copy image to clipboard')
    }
  }

  async function copySelectionToClipboard() {
    if (!documentState?.selection || !mainCanvasRef.current) return

    const selection = documentState.selection
    const clipboardCanvas = document.createElement('canvas')
    clipboardCanvas.width = selection.width
    clipboardCanvas.height = selection.height
    const context = clipboardCanvas.getContext('2d')
    if (!context) {
      updateErrorMessageStoreValue('Could not create clipboard canvas')
      return
    }

    context.drawImage(
      mainCanvasRef.current,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      0,
      0,
      selection.width,
      selection.height
    )

    await copyCanvasToClipboard(clipboardCanvas)
  }

  async function copyActiveLayerToClipboard() {
    if (!activeLayer) return

    const clipboardCanvas = document.createElement('canvas')
    clipboardCanvas.width = Math.max(1, Math.round(activeLayer.width))
    clipboardCanvas.height = Math.max(1, Math.round(activeLayer.height))
    const context = clipboardCanvas.getContext('2d')
    if (!context) {
      updateErrorMessageStoreValue('Could not create clipboard canvas')
      return
    }

    if (isImageLayer(activeLayer)) {
      const image = imageCache.get(activeLayer.dataUrl) ?? (await loadImageElement(activeLayer.dataUrl))
      context.globalAlpha = activeLayer.opacity
      context.imageSmoothingEnabled = true
      context.drawImage(image, 0, 0, activeLayer.width, activeLayer.height)
      await copyCanvasToClipboard(clipboardCanvas)
      return
    }

    const layer = cloneLayer(activeLayer)
    layer.x = 0
    layer.y = 0

    if (isHighlightLayer(layer)) {
      drawHighlightLayer(context, layer)
    } else if (isShapeLayer(layer)) {
      drawShapeLayer(context, layer)
    } else if (isTextLayer(layer)) {
      drawTextLayer(context, layer)
    }

    await copyCanvasToClipboard(clipboardCanvas)
  }

  async function copyCurrentItemToClipboard() {
    if (documentState?.selection) {
      await copySelectionToClipboard()
      return
    }

    await copyActiveLayerToClipboard()
  }

  async function saveSelectionImage() {
    if (!documentState?.selection || !mainCanvasRef.current || getIsSavingStoreValue()) return

    try {
      updateIsSavingStoreValue(true)
      const selection = documentState.selection
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = selection.width
      exportCanvas.height = selection.height
      const context = exportCanvas.getContext('2d')
      if (!context) {
        throw new Error('Could not create selection export canvas')
      }

      context.drawImage(
        mainCanvasRef.current,
        selection.x,
        selection.y,
        selection.width,
        selection.height,
        0,
        0,
        selection.width,
        selection.height
      )

      const dataUrl = exportCanvas.toDataURL('image/png')
      const defaultFileName = `kopa-selection-${selection.width}x${selection.height}.png`
      await getWindowElectron().saveFinalImage({ dataUrl, defaultFileName })
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save selection image')
    } finally {
      updateIsSavingStoreValue(false)
    }
  }

  async function saveFinalImage() {
    if (!documentState || !mainCanvasRef.current || getIsSavingStoreValue()) return

    try {
      updateIsSavingStoreValue(true)
      const dataUrl = mainCanvasRef.current.toDataURL('image/png')
      const defaultFileName = `kopa-${documentState.width}x${documentState.height}.png`
      await getWindowElectron().saveFinalImage({ dataUrl, defaultFileName })
    } catch (error) {
      updateErrorMessageStoreValue(error instanceof Error ? error.message : 'Failed to save image')
    } finally {
      updateIsSavingStoreValue(false)
    }
  }

  const isSelectionPositionUnchanged =
    !!documentState?.selection &&
    !!selectionDraft &&
    parseRoundedMathExpression(selectionDraft.x, selectionExpressionVariables) ===
      Math.round(documentState.selection.x) &&
    parseRoundedMathExpression(selectionDraft.y, selectionExpressionVariables) === Math.round(documentState.selection.y)

  const isSelectionSizeUnchanged =
    !!documentState?.selection &&
    !!selectionDraft &&
    parseRoundedMathExpression(selectionDraft.width, selectionExpressionVariables) ===
      Math.round(documentState.selection.width) &&
    parseRoundedMathExpression(selectionDraft.height, selectionExpressionVariables) ===
      Math.round(documentState.selection.height)

  function applyCanvasDraft() {
    const width = Math.max(1, parseRoundedMathExpression(canvasDraft.width, resolvedExpressionVariables) ?? Number.NaN)
    const height = Math.max(
      1,
      parseRoundedMathExpression(canvasDraft.height, resolvedExpressionVariables) ?? Number.NaN
    )
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      updateErrorMessageStoreValue('Canvas size must be valid numbers or simple math expressions')
      return
    }
    setCanvasSize(width, height, canvasDraft.background)
  }

  function setTransparentCanvasBackground() {
    setCanvasDraft(current => ({ ...current, background: 'transparent' }))

    if (documentState) {
      setCanvasSize(documentState.width, documentState.height, 'transparent')
      return
    }

    const width = Math.max(1, parseRoundedMathExpression(canvasDraft.width, resolvedExpressionVariables) ?? Number.NaN)
    const height = Math.max(
      1,
      parseRoundedMathExpression(canvasDraft.height, resolvedExpressionVariables) ?? Number.NaN
    )
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      updateErrorMessageStoreValue('Canvas size must be valid numbers or simple math expressions')
      return
    }

    setCanvasSize(width, height, 'transparent')
  }

  const layerMenu = useContextMenu<CanvasContextMenuItem>()
  const selectionContextLayerId = layerMenu.item?.type === 'selection' ? layerMenu.item.layerId : null
  const contextLayerId = layerMenu.item?.type === 'layer' ? layerMenu.item.layerId : selectionContextLayerId
  const contextLayer =
    contextLayerId && documentState ? (documentState.layers.find(layer => layer.id === contextLayerId) ?? null) : null
  const menuItems =
    layerMenu.item?.type === 'selection'
      ? [
          {
            view: 'Copy Selection',
            onClick: () => void copySelectionToClipboard(),
          },
          {
            view: 'Save Selection...',
            onClick: () => void saveSelectionImage(),
          },
          contextLayerId ? { isSeparator: true as const } : null,
          contextLayer && isImageLayer(contextLayer)
            ? {
                view: 'Preview Image...',
                onClick: () => openImagePreviewDialog(contextLayer.id),
              }
            : null,
          contextLayerId ? { isSeparator: true as const } : null,
          contextLayerId
            ? {
                view: 'Delete Object',
                onClick: () => deleteLayer(contextLayerId),
              }
            : null,
          contextLayerId ? { isSeparator: true as const } : null,
        ]
      : layerMenu.item?.type === 'layer' && contextLayer
        ? [
            isImageLayer(contextLayer)
              ? {
                  view: 'Preview Image...',
                  onClick: () => openImagePreviewDialog(contextLayer.id),
                }
              : null,
            isImageLayer(contextLayer) ? { isSeparator: true as const } : null,
            {
              view: 'Delete Object',
              onClick: () => deleteLayer(contextLayer.id),
            },
          ]
        : []

  return (
    <div className="flex h-full min-h-0 flex-col bg-base-100 text-base-content">
      <EditorAutoSaveEffect saveProjectToPath={saveProjectToPath} />
      <div className="flex min-h-0 flex-1 bg-base-200/60">
        <aside className="flex w-80 flex-col border-r border-base-content/10 bg-base-200/60  ">
          <EditorToolBarSection />
          <HighlightToolSection />

          <ShapeToolSection />

          <TextToolSection />

          {documentState?.selection && selectionDraft && (
            <SelectionSection
              canApplyPosition={!isSelectionPositionUnchanged}
              canApplySize={!isSelectionSizeUnchanged}
              onApplyPosition={applySelectionPosition}
              onApplySize={applySelectionSize}
              onCopy={() => void copySelectionToClipboard()}
              onSavePng={() => void saveSelectionImage()}
            />
          )}
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <section
              ref={viewportRef}
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden "
              onDragOver={event => {
                event.preventDefault()
              }}
              onDrop={event => {
                event.preventDefault()
                if (event.dataTransfer.files.length) {
                  const imageFiles = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'))
                  if (!imageFiles.length) return
                  if (!documentState) {
                    void createProjectFromFile(imageFiles[0])
                    return
                  }
                  void importFiles(event.dataTransfer.files)
                }
              }}
            >
              <EmptyProjectState
                onCreateNewDocument={createNewDocument}
                onCreateProjectFromClipboard={() => void createProjectFromClipboard()}
                onCreateProjectFromImageFile={() => void createProjectFromImageFileSystem()}
                onOpenRecentProject={handleOpenRecentProject}
                onApplyCanvasDraft={applyCanvasDraft}
              />

              {documentState && (
                <div
                  className="relative border border-white/10 bg-[#11141b]"
                  onContextMenu={event => {
                    if (!documentState) return
                    const canvas = overlayCanvasRef.current
                    if (!canvas) return
                    const pointer = getPointerOnCanvas(
                      event as unknown as React.PointerEvent<HTMLCanvasElement>,
                      canvas
                    )
                    const hit = hitLayer(documentState.layers, pointer)
                    const isSelectionHit = !!documentState.selection && pointInRect(pointer, documentState.selection)
                    if (isSelectionHit) {
                      layerMenu.onRightClick(event, { type: 'selection', layerId: hit?.id ?? null })
                      return
                    }
                    if (hit) {
                      layerMenu.onRightClick(event, { type: 'layer', layerId: hit.id })
                    }
                  }}
                >
                  <canvas
                    ref={mainCanvasRef}
                    className="block"
                    style={{
                      width: documentState.width * viewportScale,
                      height: documentState.height * viewportScale,
                      ...(transparentCanvasStyle ?? {}),
                    }}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 block"
                    style={{ width: documentState.width * viewportScale, height: documentState.height * viewportScale }}
                    onPointerDown={event => void handleCanvasPointerDown(event)}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={() => void handleCanvasPointerUp()}
                    onPointerCancel={handleCanvasPointerCancel}
                  />
                </div>
              )}

              {layerMenu.isOpen && menuItems.length > 0 && (
                <ContextMenu menu={layerMenu}>
                  <ContextMenuList items={menuItems} />
                </ContextMenu>
              )}
            </section>

            <aside className="flex min-h-0 w-80 flex-col overflow-y-auto border-l border-base-content/10 bg-base-200/60  ">
              <ProjectSection
                onApplyProjectName={applyProjectName}
                onSaveProject={handleSaveProject}
                onOpenProject={handleOpenProject}
              />

              {documentState && (
                <DocumentSettingsSection
                  isCanvasSizeUnchanged={
                    parseRoundedMathExpression(canvasDraft.width, resolvedExpressionVariables) ===
                      documentState.width &&
                    parseRoundedMathExpression(canvasDraft.height, resolvedExpressionVariables) === documentState.height
                  }
                  isCanvasColorUnchanged={canvasDraft.background === documentState.background}
                  isPasteSizeUnchanged={
                    (pasteSizeDraft.width.trim().length
                      ? Math.max(
                          1,
                          parseRoundedMathExpression(pasteSizeDraft.width, resolvedExpressionVariables) ?? Number.NaN
                        )
                      : null) === documentState.pasteWidth &&
                    (pasteSizeDraft.height.trim().length
                      ? Math.max(
                          1,
                          parseRoundedMathExpression(pasteSizeDraft.height, resolvedExpressionVariables) ?? Number.NaN
                        )
                      : null) === documentState.pasteHeight
                  }
                  isMovementStepUnchanged={movementStep === String(normalizedMovementStepDraft)}
                  onApplyCanvasDraft={applyCanvasDraft}
                  onSetTransparentBackground={setTransparentCanvasBackground}
                  onApplyPasteSize={() => applyPasteSize(pasteSizeDraft.width, pasteSizeDraft.height)}
                  onApplyMovementStep={applyMovementStep}
                />
              )}

              <ActiveLayerInspectorSection />

              <VariablesSection onApplyCustomVariables={applyCustomVariables} />

              <ObjectsListSection />
            </aside>
          </div>

          <EditorFooter />
        </main>
      </div>

      <ImagePreviewDialog />
      <EditorErrorDialog />
    </div>
  )
}
