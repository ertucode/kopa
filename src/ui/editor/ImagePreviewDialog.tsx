import { EyeIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { Dialog } from '@/lib/components/dialog'
import { updateImagePreviewDialogStoreValue, useImagePreviewDialogStore } from './editorSimpleStores'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampZoom(value: number): number {
  return clamp(Math.round(value * 100) / 100, 0.1, 16)
}

export function ImagePreviewDialog() {
  const [imagePreviewDialog, setImagePreviewDialog] = useImagePreviewDialogStore()

  if (!imagePreviewDialog) return null

  return (
    <Dialog
      title={`Preview Image: ${imagePreviewDialog.name}`}
      onClose={() => updateImagePreviewDialogStoreValue(null)}
      className="h-[90vh] w-[90vw] max-h-[90vh] max-w-[90vw]"
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-square"
            onClick={() =>
              setImagePreviewDialog(current =>
                current
                  ? {
                      ...current,
                      zoom: clampZoom(current.zoom / 1.25),
                    }
                  : current
              )
            }
            title="Zoom out"
          >
            <MinusIcon className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-square"
            onClick={() =>
              setImagePreviewDialog(current =>
                current
                  ? {
                      ...current,
                      zoom: 1,
                    }
                  : current
              )
            }
            title="Reset zoom"
          >
            <EyeIcon className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-square"
            onClick={() =>
              setImagePreviewDialog(current =>
                current
                  ? {
                      ...current,
                      zoom: clampZoom(current.zoom * 1.25),
                    }
                  : current
              )
            }
            title="Zoom in"
          >
            <PlusIcon className="size-4" />
          </button>
          <div className="min-w-20 text-sm text-base-content/70">{Math.round(imagePreviewDialog.zoom * 100)}%</div>
          <input
            type="range"
            min="10"
            max="1600"
            step="10"
            className="range range-xs flex-1"
            value={Math.round(imagePreviewDialog.zoom * 100)}
            onChange={event =>
              setImagePreviewDialog(current =>
                current
                  ? {
                      ...current,
                      zoom: clampZoom(Number(event.target.value) / 100),
                    }
                  : current
              )
            }
          />
        </div>
        <div className="text-xs text-base-content/55">Use the slider, buttons, or mouse wheel while hovering the preview.</div>
        <div
          className="min-h-0 flex-1 overflow-auto rounded-2xl border border-base-content/10 bg-[#11141b] p-4"
          onWheel={event => {
            event.preventDefault()
            const direction = event.deltaY < 0 ? 1.1 : 1 / 1.1
            setImagePreviewDialog(current =>
              current
                ? {
                    ...current,
                    zoom: clampZoom(current.zoom * direction),
                  }
                : current
            )
          }}
        >
          <div className="flex min-h-[24rem] min-w-full items-center justify-center">
            <img
              src={imagePreviewDialog.dataUrl}
              alt={imagePreviewDialog.name}
              className="max-w-none select-none"
              draggable={false}
              style={{
                width: imagePreviewDialog.pixelWidth * imagePreviewDialog.zoom,
                height: imagePreviewDialog.pixelHeight * imagePreviewDialog.zoom,
              }}
            />
          </div>
        </div>
      </div>
    </Dialog>
  )
}
