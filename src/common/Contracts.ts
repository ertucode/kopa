import { type GenericResult } from './GenericError.js'
import { TaskEvents } from './Tasks.js'
import { GenericEvent } from './GenericEvent.js'
import { type AsyncStorageKey } from './AsyncStorageKeys.js'
import { EditorProjectFile, EditorProjectSaveRequest, RecentEditorProject } from './EditorProject.js'

export type EventResponseMapping = {
  'task:event': TaskEvents
  'generic:event': GenericEvent
  'window:focus': void
  abortTask: Promise<void>
  openShell: Promise<void>
  runCommand: Promise<GenericResult<void>>
  getParallelPreloadPath: string
  setAlwaysOnTop: Promise<void>
  getAlwaysOnTop: Promise<boolean>
  setCompactWindowSize: Promise<void>
  restoreWindowSize: Promise<void>
  getIsCompactWindowSize: Promise<boolean>
  setAsyncStorageValue: void
  saveFinalImage: Promise<{ canceled: boolean; filePath?: string }>
  openEditorProject: Promise<{ canceled: boolean; projectPath?: string; project?: EditorProjectFile }>
  loadEditorProject: Promise<{ projectPath: string; project: EditorProjectFile }>
  saveEditorProject: Promise<{ projectPath: string }>
  saveEditorProjectAs: Promise<{ canceled: boolean; projectPath?: string }>
  loadEditorProjectAsset: Promise<string>
  getRecentEditorProjects: Promise<RecentEditorProject[]>
}

export type EventRequestMapping = {
  abortTask: string
  openShell: string
  runCommand: { name: string; filePath: string; parameters: any }
  setAlwaysOnTop: boolean
  getAlwaysOnTop: void
  setCompactWindowSize: void
  restoreWindowSize: void
  getIsCompactWindowSize: void
  setAsyncStorageValue: { key: AsyncStorageKey; value: $Maybe<string> }
  saveFinalImage: { dataUrl: string; defaultFileName: string }
  openEditorProject: void
  loadEditorProject: { projectPath: string }
  saveEditorProject: { projectPath: string; request: EditorProjectSaveRequest }
  saveEditorProjectAs: { request: EditorProjectSaveRequest; defaultName: string }
  loadEditorProjectAsset: { projectPath: string; assetId: string }
  getRecentEditorProjects: void
}

export type EventRequest<Key extends keyof EventResponseMapping> = Key extends keyof EventRequestMapping
  ? EventRequestMapping[Key]
  : void

export type UnsubscribeFunction = () => void

export type WindowElectron = {
  getParallelPreloadPath: () => Promise<string>
  onTaskEvent: (cb: (e: TaskEvents) => void) => void
  onGenericEvent: (cb: (e: GenericEvent) => void) => void
  onWindowFocus: (cb: () => void) => UnsubscribeFunction
  abortTask: (taskId: string) => Promise<void>
  openShell: (url: string) => Promise<void>
  getWindowArgs: () => string
  runCommand: (opts: { name: string; filePath: string; parameters: any }) => Promise<GenericResult<void>>
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>
  getAlwaysOnTop: () => Promise<boolean>
  setCompactWindowSize: () => Promise<void>
  restoreWindowSize: () => Promise<void>
  getIsCompactWindowSize: () => Promise<boolean>
  saveFinalImage: (request: { dataUrl: string; defaultFileName: string }) => Promise<{ canceled: boolean; filePath?: string }>
  openEditorProject: () => Promise<{ canceled: boolean; projectPath?: string; project?: EditorProjectFile }>
  loadEditorProject: (request: { projectPath: string }) => Promise<{ projectPath: string; project: EditorProjectFile }>
  saveEditorProject: (request: { projectPath: string; request: EditorProjectSaveRequest }) => Promise<{ projectPath: string }>
  saveEditorProjectAs: (request: {
    request: EditorProjectSaveRequest
    defaultName: string
  }) => Promise<{ canceled: boolean; projectPath?: string }>
  loadEditorProjectAsset: (request: { projectPath: string; assetId: string }) => Promise<string>
  getRecentEditorProjects: () => Promise<RecentEditorProject[]>
}
