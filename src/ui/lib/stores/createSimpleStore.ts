import { createStore } from '@xstate/store'
import { useSelector } from '@xstate/store-react'

type StoreValue<T> = { value: T }

type SetStateAction<T> = T | ((context: T) => T)

type StoreActions<T> = (value: SetStateAction<T>) => void

type SimpleStoreResult<T, TName extends string, TStore> = Record<`${TName}Store`, TStore> &
  Record<`use${TName}Store`, () => readonly [T, StoreActions<T>]> &
  Record<`use${TName}StoreValue`, () => T> &
  Record<`update${TName}StoreValue`, StoreActions<T>> &
  Record<`get${TName}StoreValue`, () => T>

function isUpdater<T>(value: SetStateAction<T>): value is (context: T) => T {
  return typeof value === 'function'
}

export function createSimpleStore<T, const TName extends string>(initialValue: T, name: TName) {
  const store = createStore({
    context: {
      value: initialValue,
    },
    on: {
      update: (context: StoreValue<T>, event: { value: SetStateAction<T> }) => {
        return {
          value: isUpdater(event.value) ? event.value(context.value) : event.value,
        }
      },
    },
  })

  const storeActions: StoreActions<T> = function (value) {
    store.send({ type: 'update', value })
  }

  function useStoreValue() {
    return useSelector(store, s => s.context.value)
  }

  function useStoreActions() {
    return storeActions
  }

  function useStore() {
    return [useStoreValue(), useStoreActions()] as const
  }

  function getStoreValue() {
    return store.getSnapshot().context.value
  }

  return {
    [`${name}Store`]: store,
    [`use${name}Store`]: useStore,
    [`use${name}StoreValue`]: useStoreValue,
    [`update${name}StoreValue`]: storeActions,
    [`get${name}StoreValue`]: getStoreValue,
  } as SimpleStoreResult<T, TName, typeof store>
}
