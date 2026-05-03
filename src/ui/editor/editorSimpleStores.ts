import { createSimpleStore } from '@/lib/stores/createSimpleStore'
import { DEFAULT_EDITOR_SESSION } from './editorSession'

export const { ToolStore, ToolStoreActions, useToolStore, useToolStoreValue } = createSimpleStore(
  DEFAULT_EDITOR_SESSION.tool,
  'Tool'
)
