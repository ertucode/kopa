import { Accordion } from '@/lib/components/accordion'
import { Button } from '@/lib/components/button'
import { LabeledInput } from '@/lib/components/labeled-input'
import { useSelectionDraftStore } from './editorSimpleStores'
import { FormWithInlineApply } from './form/FormWithInlineApply'

type SelectionSectionProps = {
  canApplyPosition: boolean
  canApplySize: boolean
  onApplyPosition: () => void
  onApplySize: () => void
  onCopy: () => void
  onSavePng: () => void
  isSaving: boolean
}

export function SelectionSection({
  canApplyPosition,
  canApplySize,
  onApplyPosition,
  onApplySize,
  onCopy,
  onSavePng,
  isSaving,
}: SelectionSectionProps) {
  const [selectionDraft, setSelectionDraft] = useSelectionDraftStore()

  if (!selectionDraft) return null

  return (
    <section>
      <Accordion title="Selection" defaultOpen>
        <div className="space-y-3 bg-base-200/60 text-sm text-base-content/70">
          <div className="space-y-3">
            <div className="flex">
              <Button className="btn-xs btn-soft flex-1 rounded-none" onClick={onCopy}>
                Copy
              </Button>
              <Button className="btn-xs btn-soft flex-1 rounded-none" onClick={onSavePng} disabled={isSaving}>
                Save PNG
              </Button>
            </div>

            <FormWithInlineApply label="Position" onSubmit={onApplyPosition} disabled={!canApplyPosition}>
              <LabeledInput
                label="X"
                value={selectionDraft.x}
                onChange={event => setSelectionDraft(current => (current ? { ...current, x: event } : current))}
              />
              <LabeledInput
                label="Y"
                value={selectionDraft.y}
                onChange={event => setSelectionDraft(current => (current ? { ...current, y: event } : current))}
              />
            </FormWithInlineApply>

            <FormWithInlineApply label="Exact Size" onSubmit={onApplySize} disabled={!canApplySize}>
              <LabeledInput
                label="W"
                value={selectionDraft.width}
                onChange={event => setSelectionDraft(current => (current ? { ...current, width: event } : current))}
              />
              <LabeledInput
                label="H"
                value={selectionDraft.height}
                onChange={event => setSelectionDraft(current => (current ? { ...current, height: event } : current))}
              />
            </FormWithInlineApply>
          </div>
        </div>
      </Accordion>
    </section>
  )
}
