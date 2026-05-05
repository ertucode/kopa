import { Button } from '@/lib/components/button'
import { Accordion } from '@/lib/components/accordion'
import { Input } from '@/lib/components/input'
import { OneInputOneLine } from '@/lib/components/one-input-one-line'
import { cn } from '@/lib/functions/clsx'
import { CustomVariableDraft } from '../utils/customVariableUtils'
import { useCustomVariablesStore } from './editorSimpleStores'
import { useResolvedCustomVariablesValue, useResolvedExpressionVariablesValue } from './editorDerivedValues'

type VariablesSectionProps = {
  onApplyCustomVariables: () => void
}

export function VariablesSection({ onApplyCustomVariables }: VariablesSectionProps) {
  const resolvedCustomVariableErrors = useResolvedCustomVariablesValue().errors
  const resolvedExpressionVariables = useResolvedExpressionVariablesValue()
  const [customVariables, setCustomVariables] = useCustomVariablesStore()

  const hasErrors = Object.keys(resolvedCustomVariableErrors).length > 0

  function onAddCustomVariable() {
    setCustomVariables(current => [...current, { id: crypto.randomUUID(), name: '', expression: '' }])
  }

  function onUpdateCustomVariable(variableId: string, changes: Partial<CustomVariableDraft>) {
    setCustomVariables(current =>
      current.map(variable => (variable.id === variableId ? { ...variable, ...changes } : variable))
    )
  }

  function onRemoveCustomVariable(variableId: string) {
    setCustomVariables(current => current.filter(variable => variable.id !== variableId))
  }

  return (
    <section>
      <Accordion title="Variables" defaultOpen>
        <div className="space-y-3 bg-base-200/60 text-sm text-base-content/70">
          {customVariables.map(variable => {
            const trimmedName = variable.name.trim()
            const resolvedValue = trimmedName ? resolvedExpressionVariables[trimmedName] : undefined
            const error = resolvedCustomVariableErrors[variable.id]

            return (
              <div key={variable.id} className="flex flex-col gap-2 border-b border-base-content/20 pb-2">
                <form
                  className="flex flex-col gap-2"
                  onSubmit={event => {
                    event.preventDefault()
                    onApplyCustomVariables()
                  }}
                >
                  <div>
                    <OneInputOneLine label="Name">
                      <Input
                        value={variable.name}
                        onChange={event => onUpdateCustomVariable(variable.id, { name: event })}
                        placeholder="tileSize"
                      />
                    </OneInputOneLine>
                    <OneInputOneLine label="Expression">
                      <Input
                        value={variable.expression}
                        onChange={event => onUpdateCustomVariable(variable.id, { expression: event })}
                        placeholder="canvasWidth / 4"
                      />
                    </OneInputOneLine>
                  </div>
                  <div className="flex">
                    <Button
                      type="button"
                      className="btn-xs btn-soft flex-1 rounded-none"
                      onClick={() => onRemoveCustomVariable(variable.id)}
                    >
                      Delete
                    </Button>
                    <Button className="btn-xs btn-soft flex-1 rounded-none" disabled={hasErrors}>
                      Save
                    </Button>
                  </div>
                </form>

                {error ? (
                  <div className="text-xs text-base-content/55">{error}</div>
                ) : trimmedName && resolvedValue !== undefined ? (
                  <OneInputOneLine label="Value">
                    <div className="text-xs">{resolvedValue}</div>
                  </OneInputOneLine>
                ) : (
                  <div className={cn('text-xs', error ? 'text-error' : 'text-base-content/55')}>
                    Enter a variable name and expression
                  </div>
                )}
              </div>
            )
          })}
          <Button type="button" onClick={onAddCustomVariable} className="btn-xs btn-soft w-full rounded-none">
            Add Variable
          </Button>
        </div>
      </Accordion>
    </section>
  )
}
