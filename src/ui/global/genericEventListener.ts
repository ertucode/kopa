import { getWindowElectron } from '@/getWindowElectron'

export function subscribeToGenericEvents() {
  getWindowElectron().onGenericEvent(e => {
    if (e.type === 'reload-path') {
    } else if (e.type === 'editor-action') {
    } else if (e.type === 'editor-import-images') {
    } else {
      const _exhaustiveCheck: never = e
      return _exhaustiveCheck
    }
  })
}
