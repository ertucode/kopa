import { Accordion } from '@/lib/components/accordion'
import { Button } from '@/lib/components/button'
import { Input } from '@/lib/components/input'
import { Label } from '@/lib/components/label'
import { cn } from '@/lib/functions/clsx'
import {
  useIsProjectSavingStore,
  useProjectNameDraftStore,
  useProjectNameStore,
  useProjectPathStore,
  useRecentProjectsStore,
} from './editorSimpleStores'
import { useHasUnsavedChangesStoreValue } from './editorPersistenceState'

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
          <form
            className="space-y-2"
            onSubmit={event => {
              event.preventDefault()
              onApplyProjectName()
            }}
          >
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <Label>Project Name</Label>
              <div className="flex gap-2">
                <Input
                  className="input-sm flex-1"
                  value={projectNameDraft.value}
                  onChange={value => setProjectNameDraft({ value })}
                />
                <Button
                  type="submit"
                  className="btn-sm"
                  disabled={projectNameDraft.value.trim().length === 0 || projectNameDraft.value.trim() === projectName}
                >
                  Rename
                </Button>
              </div>
            </div>
            <div className="break-all text-xs text-base-content/55">{projectPath ?? 'Unsaved project folder'}</div>
          </form>

          <div className="text-xs text-base-content/55">
            {hasUnsavedChanges ? 'Changes pending save.' : 'Project is saved.'}
          </div>

          <div className="flex gap-2">
            <Button className="btn-sm flex-1" onClick={() => void onSaveProject()} disabled={isProjectSaving}>
              Save
            </Button>
            <Button className="btn-sm btn-soft flex-1" onClick={() => void onOpenProject()}>
              Open
            </Button>
          </div>

          {recentProjects.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Switch project</div>
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
