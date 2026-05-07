export type GenericEvent =
  | {
      type: 'reload-path'
      path: string
      fileToSelect?: $Maybe<string>
    }
  | {
      type: 'editor-action'
      action:
        | 'new-project'
        | 'new-project-from-clipboard'
        | 'new-project-from-image'
        | 'open-project'
        | 'save-project'
        | 'save-png'
    }
  | {
      type: 'editor-action'
      action: 'open-recent-project'
      projectPath: string
    }
  | {
      type: 'editor-import-images'
      files: Array<{ name: string; dataUrl: string }>
    }
