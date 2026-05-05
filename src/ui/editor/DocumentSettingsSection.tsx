import { Accordion } from '@/lib/components/accordion'
import { LabeledInput } from '@/lib/components/labeled-input'
import { useCanvasDraftStore, useMovementStepDraftStore, usePasteSizeDraftStore } from './editorSimpleStores'
import { FormWithInlineApply } from './form/FormWithInlineApply'

type DocumentSettingsSectionProps = {
  isCanvasSizeUnchanged: boolean
  isPasteSizeUnchanged: boolean
  isMovementStepUnchanged: boolean
  onApplyCanvasDraft: () => void
  onApplyPasteSize: () => void
  onApplyMovementStep: () => void
}

export function DocumentSettingsSection({
  isCanvasSizeUnchanged,
  isPasteSizeUnchanged,
  isMovementStepUnchanged,
  onApplyCanvasDraft,
  onApplyPasteSize,
  onApplyMovementStep,
}: DocumentSettingsSectionProps) {
  const [canvasDraft, setCanvasDraft] = useCanvasDraftStore()
  const [pasteSizeDraft, setPasteSizeDraft] = usePasteSizeDraftStore()
  const [movementStepDraft, setMovementStepDraft] = useMovementStepDraftStore()

  return (
    <section>
      <Accordion title="Document Settings" defaultOpen>
        <div className="bg-base-200/60 text-sm text-base-content/70">
          <FormWithInlineApply label="Canvs Size" onSubmit={onApplyCanvasDraft} disabled={isCanvasSizeUnchanged}>
            <LabeledInput
              label="W"
              value={canvasDraft.width}
              onChange={value => setCanvasDraft(current => ({ ...current, width: value }))}
            />
            <LabeledInput
              label="H"
              value={canvasDraft.height}
              onChange={value => setCanvasDraft(current => ({ ...current, height: value }))}
            />
          </FormWithInlineApply>

          <FormWithInlineApply label="Paste Size" onSubmit={onApplyPasteSize} disabled={isPasteSizeUnchanged}>
            <LabeledInput
              label="W"
              value={pasteSizeDraft.width}
              onChange={value => setPasteSizeDraft(current => ({ ...current, width: value }))}
            />
            <LabeledInput
              label="H"
              value={pasteSizeDraft.height}
              onChange={value => setPasteSizeDraft(current => ({ ...current, height: value }))}
            />
          </FormWithInlineApply>

          <FormWithInlineApply label="Move Step" onSubmit={onApplyMovementStep} disabled={isMovementStepUnchanged}>
            <LabeledInput label="PX" value={movementStepDraft} onChange={value => setMovementStepDraft(value)} />
          </FormWithInlineApply>
        </div>
      </Accordion>
    </section>
  )
}
