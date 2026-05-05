import { Accordion } from '@/lib/components/accordion'
import { Button } from '@/lib/components/button'
import { Input } from '@/lib/components/input'
import { cn } from '@/lib/functions/clsx'
import {
  useIsProjectSavingStore,
  useProjectNameDraftStore,
  useProjectNameStore,
  useProjectPathStore,
  useRecentProjectsStore,
} from './editorSimpleStores'
import { useHasUnsavedChangesStoreValue } from './editorPersistenceState'
import { FormWithInlineApply } from './form/FormWithInlineApply'

type ProjectSectionProps = {
  onApplyProjectName: () => void
  onSaveProject: () => void | Promise<void>
  onOpenProject: () => void | Promise<void>
  onOpenRecentProject: (projectPath: string) => void | Promise<void>
}

export function ProjectSection({
  onApplyProjectName,
  onSaveProject,
  onOpenProject,
  onOpenRecentProject,
}: ProjectSectionProps) {
  const [projectNameDraft, setProjectNameDraft] = useProjectNameDraftStore()
  const [projectName] = useProjectNameStore()
  const [projectPath] = useProjectPathStore()
  const [recentProjects] = useRecentProjectsStore()
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

          {recentProjects.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">
                Switch project
              </div>
              <div className="space-y-2">
                {recentProjects.map(project => (
                  <button
                    key={project.projectPath}
                    className={cn(
                      'w-full rounded-xl border px-3 py-2 text-left text-xs transition',
                      project.projectPath === projectPath
                        ? 'border-info/60 bg-info/10 text-base-content'
                        : 'border-base-content/10 bg-base-100/40 text-base-content/75 hover:border-info/60 hover:bg-base-100'
                    )}
                    onClick={() => void onOpenRecentProject(project.projectPath)}
                  >
                    <div className="truncate font-medium">{project.name}</div>
                    <div className="truncate text-[11px] text-base-content/50">{project.projectPath}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Accordion>
    </section>
  )
}
