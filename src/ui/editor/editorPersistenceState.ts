import { createSimpleStore } from '@/lib/stores/createSimpleStore'

export const {
  HasUnsavedChangesStore,
  updateHasUnsavedChangesStoreValue,
  useHasUnsavedChangesStore,
  useHasUnsavedChangesStoreValue,
  getHasUnsavedChangesStoreValue,
} = createSimpleStore(false, 'HasUnsavedChanges')

export const isHydratingProjectRef: { current: boolean } = {
  current: true,
}

export const autosaveTimeoutRef: { current: number | null } = {
  current: null,
}
