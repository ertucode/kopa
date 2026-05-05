import { useRef } from 'react'
import { FolderOpenIcon, ImagePlusIcon, SaveIcon } from 'lucide-react'
import { Button } from '@/lib/components/button'
import { useDocumentStateStoreValue } from './editorCoreStores'
import {
  useIsProjectSavingStoreValue,
  useIsSavingStoreValue,
  useProjectNameStoreValue,
  useProjectPathStoreValue,
} from './editorSimpleStores'
import { useHasUnsavedChangesStoreValue } from './editorPersistenceState'

type EditorTopBarProps = {
  onCreateNewProject: () => void
  onOpenProject: () => void | Promise<void>
  onSaveProject: () => void | Promise<void>
  onSaveFinalImage: () => void | Promise<void>
  onImportFiles: (files: FileList | File[]) => void | Promise<void>
}

export function EditorTopBar({
  onCreateNewProject,
  onOpenProject,
  onSaveProject,
  onSaveFinalImage,
  onImportFiles,
}: EditorTopBarProps) {
  const documentState = useDocumentStateStoreValue()
  const projectName = useProjectNameStoreValue()
  const projectPath = useProjectPathStoreValue()
  const isSaving = useIsSavingStoreValue()
  const isProjectSaving = useIsProjectSavingStoreValue()
  const hasUnsavedChanges = useHasUnsavedChangesStoreValue()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-base-content/10 px-4 py-3">
      <Button className="btn-sm btn-soft" onClick={onCreateNewProject}>
        New Project
      </Button>
      <Button icon={FolderOpenIcon} className="btn-sm btn-soft" onClick={() => void onOpenProject()}>
        Open Project
      </Button>
      <Button className="btn-sm btn-soft" onClick={() => void onSaveProject()} disabled={isProjectSaving}>
        {projectPath ? 'Save Project' : 'Save Project As'}
      </Button>
      <Button
        icon={ImagePlusIcon}
        className="btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={!documentState}
      >
        Place image
      </Button>
      <Button
        icon={SaveIcon}
        className="btn-sm"
        onClick={() => void onSaveFinalImage()}
        disabled={!documentState || isSaving}
      >
        Save PNG
      </Button>
      <div className="text-sm text-base-content/70">
        <span className="font-medium text-base-content">{projectName}</span>
        {hasUnsavedChanges ? ' *' : ''}
        {documentState ? ` • Canvas ${documentState.width} x ${documentState.height}` : ''}
      </div>
      <div className="ml-auto text-xs text-base-content/50">
        {projectPath ? `Folder: ${projectPath}` : 'Project not saved yet.'}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        multiple
        onChange={event => {
          if (event.target.files) {
            void onImportFiles(event.target.files)
            event.target.value = ''
          }
        }}
      />
    </div>
  )
}
