export type GenericEvent =
  | {
      type: 'reload-path'
      path: string
      fileToSelect?: $Maybe<string>
    }
  | {
      type: 'editor-action'
      action: 'new-project' | 'open-project' | 'save-project' | 'save-png'
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
