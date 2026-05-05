import { Accordion } from '@/lib/components/accordion'
import { CheckboxesWrapper, CheckboxField } from '@/lib/components/checkbox-field'
import { Input } from '@/lib/components/input'
import { InputColor } from '@/lib/components/input-color'
import { OneInputOneLine } from '@/lib/components/one-input-one-line'
import { Select } from '@/lib/components/select'
import { useTextSettingsStore } from './editorSimpleStores'
import { clampTextFontSize, clampTextFontWeight } from './textUtils'
import { useAvailableFontFamilies } from './useAvailableFontFamilies'

const FONT_WEIGHT_OPTIONS = [
  { label: 'Regular', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Semibold', value: '600' },
  { label: 'Bold', value: '700' },
  { label: 'Black', value: '900' },
]

export function TextToolSection() {
  const [textSettings, setTextSettings] = useTextSettingsStore()
  const availableFonts = useAvailableFontFamilies(textSettings.fontFamily)

  return (
    <section>
      <Accordion title="Text Tool" defaultOpen detailClassName="text-base-content/70">
        <OneInputOneLine label="Text">
          <textarea
            className="textarea textarea-xs min-h-20 flex-1 rounded-none focus:outline-1 outline-offset-0"
            value={textSettings.text}
            onChange={event => setTextSettings(current => ({ ...current, text: event.target.value }))}
          />
        </OneInputOneLine>
        <OneInputOneLine label="Font">
          <Select
            options={availableFonts.map(font => ({ label: font, value: font }))}
            value={textSettings.fontFamily}
            onChange={value => setTextSettings(current => ({ ...current, fontFamily: value }))}
            searchable
          />
        </OneInputOneLine>
        <OneInputOneLine label="Size">
          <Input
            type="number"
            min={1}
            max={512}
            value={textSettings.fontSize}
            onChange={value =>
              setTextSettings(current => ({
                ...current,
                fontSize: clampTextFontSize(Number(value) || current.fontSize),
              }))
            }
          />
        </OneInputOneLine>
        <OneInputOneLine label="Weight">
          <Select
            options={FONT_WEIGHT_OPTIONS}
            value={String(textSettings.fontWeight)}
            onChange={value =>
              setTextSettings(current => ({ ...current, fontWeight: clampTextFontWeight(Number(value) || 400) }))
            }
          />
        </OneInputOneLine>
        <OneInputOneLine label="Color">
          <InputColor
            value={textSettings.color}
            onChange={value => setTextSettings(current => ({ ...current, color: value }))}
          />
        </OneInputOneLine>
        <OneInputOneLine label="Style">
          <CheckboxesWrapper>
            <CheckboxField
              label="Italic"
              checked={textSettings.italic}
              onChange={checked => setTextSettings(current => ({ ...current, italic: checked }))}
            />
            <CheckboxField
              label="Underline"
              checked={textSettings.underline}
              onChange={checked => setTextSettings(current => ({ ...current, underline: checked }))}
            />
          </CheckboxesWrapper>
        </OneInputOneLine>
      </Accordion>
    </section>
  )
}
