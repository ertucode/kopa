import { z } from 'zod'

const editorProjectLayerBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  opacity: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

const editorProjectImageLayerSchema = editorProjectLayerBaseSchema.extend({
  type: z.literal('image'),
  pixelWidth: z.number(),
  pixelHeight: z.number(),
  assetId: z.string(),
})

const legacyEditorProjectImageLayerSchema = editorProjectLayerBaseSchema
  .extend({
    pixelWidth: z.number(),
    pixelHeight: z.number(),
    assetId: z.string(),
  })
  .transform(layer => ({
    ...layer,
    type: 'image' as const,
  }))

const editorProjectHighlightLayerSchema = editorProjectLayerBaseSchema.extend({
  type: z.literal('highlight'),
  color: z.string(),
  brushSize: z.number(),
  brushShape: z.enum(['circle', 'square']),
  points: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
    })
  ),
})

const editorProjectShapeLayerSchema = editorProjectLayerBaseSchema.extend({
  type: z.literal('shape'),
  shape: z.enum(['rectangle', 'circle', 'ellipse']),
  fillColor: z.string(),
  borderColor: z.string(),
  borderRadius: z.number(),
})

const editorProjectTextLayerSchema = editorProjectLayerBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  fontWeight: z.number(),
  italic: z.boolean(),
  underline: z.boolean(),
  color: z.string(),
})

export const editorProjectLayerSchema = z.union([
  editorProjectImageLayerSchema,
  editorProjectHighlightLayerSchema,
  editorProjectShapeLayerSchema,
  editorProjectTextLayerSchema,
  legacyEditorProjectImageLayerSchema,
])

export const editorProjectSelectionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

export const editorProjectDocumentSchema = z.object({
  width: z.number(),
  height: z.number(),
  background: z.string().default('transparent'),
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
  background: z.string().optional(),
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
  type: z.enum(['image', 'highlight', 'shape', 'text']).optional(),
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
  color: z.string().optional(),
  brushSize: z.number().optional(),
  brushShape: z.enum(['circle', 'square']).optional(),
  shape: z.enum(['rectangle', 'circle', 'ellipse']).optional(),
  fillColor: z.string().optional(),
  borderColor: z.string().optional(),
  borderRadius: z.number().optional(),
  text: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.number().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  points: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
    })
  ).optional(),
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
  tool: z.enum(['select', 'marquee', 'highlight', 'shape', 'text']),
  canvasDraft: z.object({
    width: z.string(),
    height: z.string(),
    background: z.string().default('transparent'),
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
  highlightSettings: z.object({
    color: z.string(),
    opacity: z.number(),
    brushShape: z.enum(['circle', 'square']),
    brushSize: z.number(),
  }).default({
    color: '#facc15',
    opacity: 0.35,
    brushShape: 'circle',
    brushSize: 32,
  }),
  shapeSettings: z.object({
    shape: z.enum(['rectangle', 'circle', 'ellipse']),
    fillColor: z.string(),
    borderColor: z.string(),
    borderRadius: z.number(),
    opacity: z.number(),
  }).default({
    shape: 'rectangle',
    fillColor: '#60a5fa',
    borderColor: '#dbeafe',
    borderRadius: 16,
    opacity: 0.8,
  }),
  textSettings: z.object({
    text: z.string(),
    fontFamily: z.string(),
    fontSize: z.number(),
    fontWeight: z.number(),
    italic: z.boolean(),
    underline: z.boolean(),
    color: z.string(),
  }).default({
    text: 'Text',
    fontFamily: 'Arial',
    fontSize: 48,
    fontWeight: 400,
    italic: false,
    underline: false,
    color: '#ffffff',
  }),
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
