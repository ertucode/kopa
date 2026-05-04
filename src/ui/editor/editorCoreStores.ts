import { createSimpleStore } from '@/lib/stores/createSimpleStore'
import { EditorDocument, HistoryEntry } from './types'

export type EditorHistoryState = {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export const {
  DocumentStateStore,
  updateDocumentStateStoreValue,
  useDocumentStateStore,
  useDocumentStateStoreValue,
  getDocumentStateStoreValue,
} = createSimpleStore<EditorDocument | null, 'DocumentState'>(null, 'DocumentState')

export const {
  HistoryStore,
  updateHistoryStoreValue,
  useHistoryStore,
  useHistoryStoreValue,
  getHistoryStoreValue,
} = createSimpleStore<EditorHistoryState, 'History'>({ past: [], future: [] }, 'History')
