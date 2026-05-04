export namespace ArrayUtils {
  export const moveToFirst = <T>(arr: readonly T[], item: T): T[] => {
    const index = arr.indexOf(item)

    if (index > 0) {
      let newArr = [...arr]
      newArr.splice(index, 1)
      newArr.unshift(item)
      return newArr
    }
    return arr as T[]
  }

  export const removeItem = <T>(arr: T[], item: T) => {
    const idx = arr.findIndex(i => item === i)
    if (idx !== -1) {
      arr.splice(idx, 1)
    }
  }

  export const removeDuplicates = <T>(arr: readonly T[]) => {
    return [...new Set(arr)]
  }

  export const overlaps = <T>(biggerArr: readonly T[], smallerArr: readonly T[]) => {
    return smallerArr.some(el => biggerArr.includes(el))
  }

  export const findAndRemove = <T>(arr: T[], predicate: (i: T) => boolean) => {
    const idx = arr.findIndex(i => predicate(i))

    if (idx === -1) return

    return arr.splice(idx, 1)[0]
  }

  export const orderByPriorityArray = <T, TPriority>(
    arr: T[],
    priorityArray: TPriority[],
    keyGetter: (item: T) => TPriority
  ) => {
    const found: T[] = []
    const copy = [...arr]

    priorityArray.forEach(p => {
      const maybeItem = ArrayUtils.findAndRemove(copy, i => keyGetter(i) === p)

      if (maybeItem) {
        found.push(maybeItem)
      }
    })

    return [...found, ...copy]
  }

  export const includes = <TArr extends readonly unknown[]>(
    arr: TArr,
    searchElement: unknown
  ): searchElement is TArr[number] => {
    return arr.includes(searchElement)
  }

  export function createArray<T extends {}>(items: (T | undefined | null | boolean)[]): T[] {
    return items.filter(i => !!i) as T[]
  }

  export function lastN<T>(arr: readonly T[], n: number) {
    return arr.slice(arr.length - n)
  }

  export function* enumerate<T>(arr: readonly T[]): Generator<[number, T]> {
    for (let i = 0; i < arr.length; i++) {
      yield [i, arr[i]]
    }
  }

  export function moveArrayItem<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
    const nextItems = [...arr]
    const [item] = nextItems.splice(fromIndex, 1)
    if (item === undefined) return arr
    nextItems.splice(toIndex, 0, item)
    return nextItems
  }
}
