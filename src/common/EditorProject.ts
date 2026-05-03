import { z } from 'zod'

export const editorProjectLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  opacity: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  pixelWidth: z.number(),
  pixelHeight: z.number(),
  assetId: z.string(),
})

export const editorProjectSelectionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

export const editorProjectDocumentSchema = z.object({
  width: z.number(),
  height: z.number(),
  pasteWidth: z.number().nullable(),
  pasteHeight: z.number().nullable(),
  layers: z.array(editorProjectLayerSchema),
  activeLayerId: z.string().nullable(),
  selection: editorProjectSelectionSchema.nullable(),
})

const editorProjectDocumentPropsChangeSchema = z.object({
  type: z.literal('set-document-props'),
  width: z.number().optional(),
  height: z.number().optional(),
  pasteWidth: z.number().nullable().optional(),
  pasteHeight: z.number().nullable().optional(),
  activeLayerId: z.string().nullable().optional(),
  selection: editorProjectSelectionSchema.nullable().optional(),
})

const editorProjectInsertLayerChangeSchema = z.object({
  type: z.literal('insert-layer'),
  index: z.number().int().nonnegative(),
  layer: editorProjectLayerSchema,
})

const editorProjectRemoveLayerChangeSchema = z.object({
  type: z.literal('remove-layer'),
  layerId: z.string(),
})

const editorProjectMoveLayerChangeSchema = z.object({
  type: z.literal('move-layer'),
  layerId: z.string(),
  toIndex: z.number().int().nonnegative(),
})

const editorProjectLayerPatchSchema = z.object({
  name: z.string().optional(),
  visible: z.boolean().optional(),
  opacity: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  pixelWidth: z.number().optional(),
  pixelHeight: z.number().optional(),
  assetId: z.string().optional(),
})

const editorProjectUpdateLayerChangeSchema = z.object({
  type: z.literal('update-layer'),
  layerId: z.string(),
  changes: editorProjectLayerPatchSchema,
})

export const editorProjectChangeSchema = z.discriminatedUnion('type', [
  editorProjectDocumentPropsChangeSchema,
  editorProjectInsertLayerChangeSchema,
  editorProjectRemoveLayerChangeSchema,
  editorProjectMoveLayerChangeSchema,
  editorProjectUpdateLayerChangeSchema,
])

export const editorProjectOperationSchema = z.object({
  label: z.string(),
  changes: z.array(editorProjectChangeSchema),
})

export const editorProjectAssetSchema = z.object({
  mimeType: z.string(),
  relativePath: z.string(),
})

export const editorProjectUiStateSchema = z.object({
  tool: z.enum(['select', 'marquee']),
  canvasDraft: z.object({
    width: z.string(),
    height: z.string(),
  }),
  movementStep: z.string(),
  movementStepDraft: z.string().default('1'),
  pasteSizeDraft: z
    .object({
      width: z.string(),
      height: z.string(),
    })
    .default({ width: '', height: '' }),
  layerPositionDraft: z
    .object({
      layerId: z.string(),
      x: z.string(),
      y: z.string(),
    })
    .nullable()
    .default(null),
  layerSizeDraft: z
    .object({
      layerId: z.string(),
      width: z.string(),
      height: z.string(),
    })
    .nullable()
    .default(null),
  selectionDraft: z
    .object({
      x: z.string(),
      y: z.string(),
      width: z.string(),
      height: z.string(),
    })
    .nullable()
    .default(null),
  variables: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      expression: z.string(),
    })
  ).default([]),
})

export const editorProjectFileSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  savedAt: z.string(),
  assets: z.record(z.string(), editorProjectAssetSchema),
  initialDocument: editorProjectDocumentSchema.nullable(),
  operations: z.array(editorProjectOperationSchema),
  currentIndex: z.number().int().nonnegative(),
  ui: editorProjectUiStateSchema,
})

export const editorProjectAssetContentSchema = z.object({
  assetId: z.string(),
  mimeType: z.string(),
  dataBase64: z.string(),
})

export const editorProjectSaveRequestSchema = z.object({
  project: editorProjectFileSchema,
  assetContents: z.array(editorProjectAssetContentSchema),
})

export const recentEditorProjectSchema = z.object({
  projectPath: z.string(),
  name: z.string(),
  updatedAt: z.string(),
})

export type EditorProjectAsset = z.infer<typeof editorProjectAssetSchema>
export type EditorProjectAssetContent = z.infer<typeof editorProjectAssetContentSchema>
export type EditorProjectChange = z.infer<typeof editorProjectChangeSchema>
export type EditorProjectDocument = z.infer<typeof editorProjectDocumentSchema>
export type EditorProjectFile = z.infer<typeof editorProjectFileSchema>
export type EditorProjectLayer = z.infer<typeof editorProjectLayerSchema>
export type EditorProjectOperation = z.infer<typeof editorProjectOperationSchema>
export type EditorProjectSaveRequest = z.infer<typeof editorProjectSaveRequestSchema>
export type EditorProjectSelection = z.infer<typeof editorProjectSelectionSchema>
export type EditorProjectUiState = z.infer<typeof editorProjectUiStateSchema>
export type RecentEditorProject = z.infer<typeof recentEditorProjectSchema>
