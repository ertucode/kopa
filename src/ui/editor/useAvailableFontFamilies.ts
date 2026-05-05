import { useEffect, useMemo, useState } from 'react'
import { FALLBACK_FONT_FAMILIES } from './textUtils'

type LocalFontData = {
  family: string
}

type QueryLocalFontsWindow = Window & {
  queryLocalFonts?: () => Promise<LocalFontData[]>
}

function uniqSorted(items: string[]) {
  return Array.from(new Set(items.filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

export function useAvailableFontFamilies(currentFontFamily?: string) {
  const [availableFonts, setAvailableFonts] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadFonts() {
      const queryLocalFonts = (window as QueryLocalFontsWindow).queryLocalFonts
      if (!queryLocalFonts) return

      try {
        const fonts = await queryLocalFonts()
        if (cancelled) return
        setAvailableFonts(uniqSorted(fonts.map(font => font.family)))
      } catch {
        if (cancelled) return
      }
    }

    void loadFonts()
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(
    () => uniqSorted([...FALLBACK_FONT_FAMILIES, ...(currentFontFamily ? [currentFontFamily] : []), ...availableFonts]),
    [availableFonts, currentFontFamily]
  )
}
