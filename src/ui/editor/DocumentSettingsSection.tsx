import { Accordion } from '@/lib/components/accordion'
import { InputColor } from '@/lib/components/input-color'
import { LabeledInput } from '@/lib/components/labeled-input'
import { MinusIcon } from 'lucide-react'
import { useCanvasDraftStore, useMovementStepDraftStore, usePasteSizeDraftStore } from './editorSimpleStores'
import { FormWithInlineApply } from './form/FormWithInlineApply'

type DocumentSettingsSectionProps = {
  isCanvasSizeUnchanged: boolean
  isCanvasColorUnchanged: boolean
  isPasteSizeUnchanged: boolean
  isMovementStepUnchanged: boolean
  onApplyCanvasDraft: () => void
  onSetTransparentBackground: () => void
  onApplyPasteSize: () => void
  onApplyMovementStep: () => void
}

export function DocumentSettingsSection({
  isCanvasSizeUnchanged,
  isCanvasColorUnchanged,
  isPasteSizeUnchanged,
  isMovementStepUnchanged,
  onApplyCanvasDraft,
  onSetTransparentBackground,
  onApplyPasteSize,
  onApplyMovementStep,
}: DocumentSettingsSectionProps) {
  const [canvasDraft, setCanvasDraft] = useCanvasDraftStore()
  const [pasteSizeDraft, setPasteSizeDraft] = usePasteSizeDraftStore()
  const [movementStepDraft, setMovementStepDraft] = useMovementStepDraftStore()
  const backgroundOverlay =
    canvasDraft.background === 'transparent' ? (
      <div
        className="flex h-full items-center justify-center border border-base-content/20 text-[11px] font-medium text-base-content/70"
        style={{
          backgroundColor: '#ffffff',
          backgroundImage:
            'linear-gradient(45deg, rgba(17,20,27,0.15) 25%, transparent 25%), linear-gradient(-45deg, rgba(17,20,27,0.15) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(17,20,27,0.15) 75%), linear-gradient(-45deg, transparent 75%, rgba(17,20,27,0.15) 75%)',
          backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
          backgroundSize: '12px 12px',
        }}
      >
        Transparent
      </div>
    ) : null

  return (
    <section>
      <Accordion title="Document Settings" defaultOpen>
        <div className="bg-base-200/60 text-sm text-base-content/70">
          <FormWithInlineApply label="Canvas" onSubmit={onApplyCanvasDraft} disabled={isCanvasSizeUnchanged}>
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

          <FormWithInlineApply
            label={
              <div className="flex items-center gap-2">
                <span>Background</span>
                <button
                  className={'btn btn-xs btn-ghost w-6 rounded-none px-0'}
                  type="button"
                  onClick={onSetTransparentBackground}
                  style={{
                    backgroundColor: '#ffffff',
                    backgroundImage:
                      'linear-gradient(45deg, rgba(17,20,27,0.15) 25%, transparent 25%), linear-gradient(-45deg, rgba(17,20,27,0.15) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(17,20,27,0.15) 75%), linear-gradient(-45deg, transparent 75%, rgba(17,20,27,0.15) 75%)',
                    backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                    backgroundSize: '12px 12px',
                  }}
                >
                  {<MinusIcon className="h-3 w-3" />}
                </button>
              </div>
            }
            onSubmit={onApplyCanvasDraft}
            disabled={isCanvasColorUnchanged}
          >
            <InputColor
              value={canvasDraft.background}
              onChange={value => setCanvasDraft(current => ({ ...current, background: value }))}
              overlay={backgroundOverlay}
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
