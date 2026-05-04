import { Accordion } from '@/lib/components/accordion'
import { Input } from '@/lib/components/input'
import { InputColor } from '@/lib/components/input-color'
import { Label } from '@/lib/components/label'
import { Select } from '@/lib/components/select'
import { clampHighlightOpacity, clampHighlightBrushSize } from './highlightUtils'
import { HighlightBrushShape } from './types'
import { useHighlightSettingsStore } from './editorSimpleStores'

export function HighlightToolSection() {
  const [highlightSettings, setHighlightSettings] = useHighlightSettingsStore()
  return (
    <section>
      <Accordion title="Highlight Tool" defaultOpen>
        <div className="space-y-3 bg-base-200/60 text-sm text-base-content/70">
          <div className="grid grid-cols-[auto_1fr] items-center gap-0">
            <Label>Color</Label>
            <InputColor
              value={highlightSettings.color}
              onChange={event =>
                setHighlightSettings(current => ({
                  ...current,
                  color: event,
                }))
              }
            />
            <Label>Opacity</Label>
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <Input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                className="range range-xs"
                value={highlightSettings.opacity}
                onChange={event =>
                  setHighlightSettings(current => ({
                    ...current,
                    opacity: clampHighlightOpacity(Number(event)),
                  }))
                }
              />
              <span className="w-10 text-right text-xs">{Math.round(highlightSettings.opacity * 100)}%</span>
            </div>

            <Label>Brush</Label>
            <Select
              options={[
                { label: 'Circle', value: 'circle' },
                { label: 'Square', value: 'square' },
              ]}
              value={highlightSettings.brushShape}
              onChange={event =>
                setHighlightSettings(current => ({
                  ...current,
                  brushShape: event as HighlightBrushShape,
                }))
              }
            />
            <Label>Size</Label>
            <Input
              type="number"
              min={4}
              max={256}
              className="input input-xs"
              value={highlightSettings.brushSize}
              onChange={event =>
                setHighlightSettings(current => ({
                  ...current,
                  brushSize: clampHighlightBrushSize(Number(event) || current.brushSize),
                }))
              }
            />
          </div>
        </div>
      </Accordion>
    </section>
  )
}
