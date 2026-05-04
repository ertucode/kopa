import { Dialog } from '@/lib/components/dialog'
import { useErrorMessageStore } from './editorSimpleStores'

export function EditorErrorDialog() {
  const [errorMessage, setErrorMessage] = useErrorMessageStore()

  return (
    errorMessage && (
      <Dialog title="Editor Error" onClose={() => setErrorMessage(null)} className="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">{errorMessage}</p>
          <div className="modal-action mt-0">
            <button className="btn btn-primary" onClick={() => setErrorMessage(null)}>
              Close
            </button>
          </div>
        </div>
      </Dialog>
    )
  )
}
