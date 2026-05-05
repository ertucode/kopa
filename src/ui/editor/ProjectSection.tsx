import { Accordion } from '@/lib/components/accordion'
import { Button } from '@/lib/components/button'
import { Input } from '@/lib/components/input'
import {
  useIsProjectSavingStore,
  useProjectNameDraftStore,
  useProjectNameStore,
  useProjectPathStore,
} from './editorSimpleStores'
import { useHasUnsavedChangesStoreValue } from './editorPersistenceState'
import { FormWithInlineApply } from './form/FormWithInlineApply'

type ProjectSectionProps = {
  onApplyProjectName: () => void
  onSaveProject: () => void | Promise<void>
  onOpenProject: () => void | Promise<void>
}

export function ProjectSection({
  onApplyProjectName,
  onSaveProject,
  onOpenProject,
}: ProjectSectionProps) {
  const [projectNameDraft, setProjectNameDraft] = useProjectNameDraftStore()
  const [projectName] = useProjectNameStore()
  const [projectPath] = useProjectPathStore()
  const [isProjectSaving] = useIsProjectSavingStore()
  const hasUnsavedChanges = useHasUnsavedChangesStoreValue()

  return (
    <section>
      <Accordion title="Project" defaultOpen>
        <div className="space-y-3 bg-base-200/60 text-sm text-base-content/70">
          <FormWithInlineApply
            onSubmit={onApplyProjectName}
            label="Project Name"
            disabled={projectNameDraft.value.trim().length === 0 || projectNameDraft.value.trim() === projectName}
          >
            <Input value={projectNameDraft.value} onChange={value => setProjectNameDraft({ value })} />
          </FormWithInlineApply>
          <div className="break-all text-xs text-base-content/55">{projectPath ?? 'Unsaved project folder'}</div>

          {projectPath && (
            <div className="text-xs text-base-content/55">
              {hasUnsavedChanges ? 'Changes pending save.' : 'Project is saved.'}
            </div>
          )}

          <div className="flex">
            <Button
              className="btn-xs btn-soft rounded-none flex-1"
              onClick={() => void onSaveProject()}
              disabled={isProjectSaving}
            >
              Save
            </Button>
            <Button className="btn-xs btn-soft rounded-none flex-1" onClick={() => void onOpenProject()}>
              Open
            </Button>
          </div>
        </div>
      </Accordion>
    </section>
  )
}
