import React from 'react'
import { clsx } from '../functions/clsx'

export type SelectProps = {
  options: { label: string; value: string }[]
  value: string
  onChange: (value: string) => void
  searchable?: boolean
}

export function Select({ options, value, onChange, searchable = false }: SelectProps) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const selectedOption = options.find(option => option.value === value) ?? options[0]

  const filteredOptions = React.useMemo(() => {
    if (!searchable) {
      return options
    }

    const normalizedSearch = search.trim().toLowerCase()

    if (!normalizedSearch) {
      return options
    }

    return options.filter(option => {
      return (
        option.label.toLowerCase().includes(normalizedSearch) || option.value.toLowerCase().includes(normalizedSearch)
      )
    })
  }, [options, search, searchable])

  React.useEffect(() => {
    if (!searchable || !isOpen) {
      return
    }

    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [isOpen, searchable])

  React.useEffect(() => {
    if (!searchable || !isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen, searchable])

  const selectOption = (nextValue: string) => {
    onChange(nextValue)
    setIsOpen(false)
    setSearch('')
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      const matchingOption = filteredOptions[0]

      if (!matchingOption) {
        return
      }

      selectOption(matchingOption.value)
      return
    }

    if (event.key === 'Escape' && search) {
      event.preventDefault()
      setSearch('')
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  const nativeSelect = (
    <select
      className="select select-xs rounded-none focus-within:outline-1 outline-offset-0"
      value={value}
      onChange={event => onChange(event.target.value)}
    >
      {filteredOptions.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )

  if (!searchable) {
    return nativeSelect
  }

  return (
    <div className="relative min-w-0 w-full" ref={rootRef}>
      <button
        type="button"
        className="select select-xs rounded-none focus-within:outline-1 outline-offset-0 flex w-full items-center justify-between gap-2"
        onClick={() => {
          setIsOpen(current => {
            const nextIsOpen = !current

            if (nextIsOpen) {
              setSearch('')
            }

            return nextIsOpen
          })
        }}
      >
        <span className="truncate text-left">{selectedOption?.label ?? ''}</span>
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 flex w-full min-w-40 flex-col gap-1 border border-base-300 bg-base-100 p-1 shadow-lg">
          <input
            ref={searchInputRef}
            className="input input-xs rounded-none focus-within:outline-1 outline-offset-0"
            type="text"
            value={search}
            placeholder="Search..."
            onChange={event => setSearch(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => {
                const isSelected = option.value === value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={clsx(
                      'flex w-full items-center px-2 py-1 text-left text-xs hover:bg-base-200',
                      isSelected && 'bg-base-200'
                    )}
                    onClick={() => selectOption(option.value)}
                  >
                    <span className="truncate">{option.label}</span>
                  </button>
                )
              })
            ) : (
              <div className="px-2 py-1 text-xs text-base-content/60">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
