import { Accordion } from '@/lib/components/accordion'
import { InputColor } from '@/lib/components/input-color'
import { InputRange } from '@/lib/components/input-range'
import { Input } from '@/lib/components/input'
import { Label } from '@/lib/components/label'
import { Select } from '@/lib/components/select'
import { useShapeSettingsStore } from './editorSimpleStores'
import { clampShapeOpacity } from './shapeUtils'
import { ShapeType } from './types'

export function ShapeToolSection() {
  const [shapeSettings, setShapeSettings] = useShapeSettingsStore()

  return (
    <section>
      <Accordion title="Shape Tool" defaultOpen>
        <div className="space-y-3 bg-base-200/60 text-sm text-base-content/70">
          <div className="grid grid-cols-[auto_1fr] items-center gap-0">
            <Label>Type</Label>
            <Select
              options={[
                { label: 'Rectangle', value: 'rectangle' },
                { label: 'Circle', value: 'circle' },
                { label: 'Ellipse', value: 'ellipse' },
              ]}
              value={shapeSettings.shape}
              onChange={event =>
                setShapeSettings(current => ({
                  ...current,
                  shape: event as ShapeType,
                }))
              }
            />
            <Label>Fill</Label>
            <InputColor
              value={shapeSettings.fillColor}
              onChange={value => setShapeSettings(current => ({ ...current, fillColor: value }))}
            />
            <Label>Border</Label>
            <InputColor
              value={shapeSettings.borderColor}
              onChange={value => setShapeSettings(current => ({ ...current, borderColor: value }))}
            />
            <Label>Border Width</Label>
            <Input
              type="number"
              min={0}
              className="input input-xs"
              value={shapeSettings.borderWidth ?? 2}
              onChange={event =>
                setShapeSettings(current => ({
                  ...current,
                  borderWidth: Math.max(0, Math.round(Number(event) || 0)),
                }))
              }
            />
            <Label>Radius</Label>
            <Input
              type="number"
              min={0}
              className="input input-xs"
              value={shapeSettings.borderRadius}
              onChange={event =>
                setShapeSettings(current => ({
                  ...current,
                  borderRadius: Math.max(0, Math.round(Number(event) || 0)),
                }))
              }
            />
            <Label>Opacity</Label>
            <InputRange
              value={shapeSettings.opacity}
              onChange={event =>
                setShapeSettings(current => ({ ...current, opacity: clampShapeOpacity(Number(event)) }))
              }
            />
          </div>
        </div>
      </Accordion>
    </section>
  )
}
