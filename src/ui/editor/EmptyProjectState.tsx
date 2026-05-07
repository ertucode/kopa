import { Button } from '@/lib/components/button'
import { useDocumentStateStoreValue } from './editorCoreStores'
import { useCanvasDraftStore, useRecentProjectsStore } from './editorSimpleStores'
import { NewDocumentPreset } from './types'

const DOCUMENT_PRESETS: NewDocumentPreset[] = [
  { label: 'Avatar', width: 512, height: 512 },
  { label: 'Square', width: 1024, height: 1024 },
  { label: 'Full HD', width: 1920, height: 1080 },
  { label: 'Poster', width: 2048, height: 2048 },
]

type EmptyProjectStateProps = {
  onCreateNewDocument: (width: number, height: number) => void
  onCreateProjectFromClipboard: () => void | Promise<void>
  onCreateProjectFromImageFile: () => void | Promise<void>
  onOpenRecentProject: (projectPath: string) => void | Promise<void>
  onApplyCanvasDraft: () => void
}

export function EmptyProjectState({
  onCreateNewDocument,
  onCreateProjectFromClipboard,
  onCreateProjectFromImageFile,
  onOpenRecentProject,
  onApplyCanvasDraft,
}: EmptyProjectStateProps) {
  const documentState = useDocumentStateStoreValue()
  const [recentProjects] = useRecentProjectsStore()
  const [canvasDraft, setCanvasDraft] = useCanvasDraftStore()

  if (documentState) return null

  return (
    <div className="w-full max-w-3xl rounded-3xl border border-base-content/10 bg-base-200/85 p-8 shadow-2xl backdrop-blur">
      <div className="mb-6">
        <div className="text-3xl font-semibold">Start a project</div>
        <p className="mt-2 max-w-xl text-sm text-base-content/70">
          Projects now live on disk with reusable history and image assets, so you can return to previous work and
          switch between saved canvases.
        </p>
      </div>
      {recentProjects.length > 0 && (
        <div className="mb-8 rounded-2xl border border-base-content/10 bg-base-100/70 p-4">
          <div className="mb-3 text-sm font-medium">Recent projects</div>
          <div className="space-y-2">
            {recentProjects.map(project => (
              <button
                key={project.projectPath}
                className="flex w-full items-start justify-between rounded-xl border border-base-content/10 bg-base-100 px-3 py-3 text-left transition hover:border-info/60 hover:bg-base-300"
                onClick={() => void onOpenRecentProject(project.projectPath)}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{project.name}</div>
                  <div className="truncate text-xs text-base-content/55">{project.projectPath}</div>
                </div>
                <div className="ml-3 shrink-0 text-[11px] text-base-content/45">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        {DOCUMENT_PRESETS.map(preset => (
          <button
            key={preset.label}
            className="rounded-2xl border border-base-content/10 bg-base-100 px-4 py-5 text-left transition hover:border-info/60 hover:bg-base-300"
            onClick={() => onCreateNewDocument(preset.width, preset.height)}
          >
            <div className="font-medium">{preset.label}</div>
            <div className="mt-1 text-sm text-base-content/65">
              {preset.width} x {preset.height}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Button className="btn-soft" onClick={() => void onCreateProjectFromClipboard()}>
          From Clipboard
        </Button>
        <Button className="btn-soft" onClick={() => void onCreateProjectFromImageFile()}>
          From Image...
        </Button>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="form-control gap-2">
          <span className="label text-sm">Custom width</span>
          <input
            className="input"
            value={canvasDraft.width}
            onChange={event => setCanvasDraft(current => ({ ...current, width: event.target.value }))}
          />
        </label>
        <label className="form-control gap-2">
          <span className="label text-sm">Custom height</span>
          <input
            className="input"
            value={canvasDraft.height}
            onChange={event => setCanvasDraft(current => ({ ...current, height: event.target.value }))}
          />
        </label>
        <Button onClick={onApplyCanvasDraft}>Create canvas</Button>
      </div>
    </div>
  )
}
