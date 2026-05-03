export type CustomVariableDraft = {
  id: string
  name: string
  expression: string
}

export type ExpressionVariables = Record<string, number>

export function parseMathExpression(value: string, variables: ExpressionVariables = {}): number | null {
  const input = value.trim()
  if (!input) return null

  const matchedTokens = input.match(/[A-Za-z_][A-Za-z0-9_]*|\d*\.\d+|\d+|[()+\-*/%]/g)
  if (!matchedTokens || matchedTokens.join('') !== input.replace(/\s+/g, '')) {
    return null
  }

  const tokens = matchedTokens

  let index = 0

  function parseExpression(): number | null {
    let result = parseTerm()
    if (result === null) return null

    while (index < tokens.length) {
      const operator = tokens[index]
      if (operator !== '+' && operator !== '-') break
      index += 1
      const right = parseTerm()
      if (right === null) return null
      result = operator === '+' ? result + right : result - right
    }

    return result
  }

  function parseTerm(): number | null {
    let result = parseFactor()
    if (result === null) return null

    while (index < tokens.length) {
      const operator = tokens[index]
      if (operator !== '*' && operator !== '/' && operator !== '%') break
      index += 1
      const right = parseFactor()
      if (right === null) return null
      if ((operator === '/' || operator === '%') && right === 0) return null
      if (operator === '*') {
        result *= right
      } else if (operator === '/') {
        result /= right
      } else {
        result %= right
      }
    }

    return result
  }

  function parseFactor(): number | null {
    const token = tokens[index]
    if (!token) return null

    if (token === '+') {
      index += 1
      return parseFactor()
    }

    if (token === '-') {
      index += 1
      const value = parseFactor()
      return value === null ? null : -value
    }

    if (token === '(') {
      index += 1
      const value = parseExpression()
      if (value === null || tokens[index] !== ')') return null
      index += 1
      return value
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      index += 1
      const variable = variables[token]
      return variable === undefined || !Number.isFinite(variable) ? null : variable
    }

    index += 1
    const value = Number(token)
    return Number.isFinite(value) ? value : null
  }

  const result = parseExpression()
  if (result === null || index !== tokens.length || !Number.isFinite(result)) {
    return null
  }

  return result
}

export function parseRoundedMathExpression(value: string, variables: ExpressionVariables = {}): number | null {
  const result = parseMathExpression(value, variables)
  if (result === null) return null
  const rounded = Math.round(result)
  return Number.isFinite(rounded) ? rounded : null
}

export function isValidVariableName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}

export function resolveCustomVariables(
  variableDrafts: CustomVariableDraft[],
  baseVariables: ExpressionVariables
): {
  variables: ExpressionVariables
  errors: Record<string, string>
} {
  const variables: ExpressionVariables = { ...baseVariables }
  const errors: Record<string, string> = {}
  const draftByName = new Map<string, CustomVariableDraft>()

  for (const variable of variableDrafts) {
    const trimmedName = variable.name.trim()
    if (!trimmedName) {
      errors[variable.id] = 'Variable name is required'
      continue
    }
    if (!isValidVariableName(trimmedName)) {
      errors[variable.id] = 'Use letters, numbers, and underscores only'
      continue
    }
    if (trimmedName in baseVariables) {
      errors[variable.id] = 'Name conflicts with a built-in variable'
      continue
    }
    if (draftByName.has(trimmedName)) {
      errors[variable.id] = 'Variable names must be unique'
      const existingDraft = draftByName.get(trimmedName)
      if (existingDraft) {
        errors[existingDraft.id] = 'Variable names must be unique'
      }
      continue
    }
    draftByName.set(trimmedName, { ...variable, name: trimmedName })
  }

  const visiting = new Set<string>()
  const resolved = new Set<string>()

  function resolveVariable(name: string): number | null {
    if (name in baseVariables) return baseVariables[name]
    if (resolved.has(name)) return variables[name] ?? null
    const draft = draftByName.get(name)
    if (!draft) return null
    if (errors[draft.id]) return null
    if (visiting.has(name)) {
      errors[draft.id] = 'Circular variable reference'
      return null
    }

    visiting.add(name)
    const scopedVariables = new Proxy(variables, {
      get(target, property) {
        if (typeof property !== 'string') return undefined
        if (property in target) return target[property]
        const resolvedValue = resolveVariable(property)
        return resolvedValue === null ? undefined : resolvedValue
      },
      has(target, property) {
        if (typeof property !== 'string') return false
        return property in target || draftByName.has(property)
      },
    }) as ExpressionVariables

    const result = parseMathExpression(draft.expression, scopedVariables)
    visiting.delete(name)

    if (result === null || !Number.isFinite(result)) {
      errors[draft.id] = 'Expression could not be resolved'
      return null
    }

    variables[name] = result
    resolved.add(name)
    return result
  }

  for (const name of draftByName.keys()) {
    resolveVariable(name)
  }

  return { variables, errors }
}