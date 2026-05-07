import fs from 'fs/promises'
import path from 'path'
import { BrowserWindow, dialog } from 'electron'
import { getRecentEditorProjects } from './editor-projects.js'

type CreateWindow = () => void | Promise<BrowserWindow>

type EditorImageFile = {
  name: string
  dataUrl: string
}

function sendEditorAction(
  action:
    | 'new-project'
    | 'new-project-from-clipboard'
    | 'new-project-from-image'
    | 'open-project'
    | 'save-project'
    | 'save-png'
) {
  BrowserWindow.getFocusedWindow()?.webContents.send('generic:event', {
    type: 'editor-action',
    action,
  })
}

function sendOpenRecentProjectAction(window: BrowserWindow | null, projectPath: string) {
  window?.webContents.send('generic:event', {
    type: 'editor-action',
    action: 'open-recent-project',
    projectPath,
  })
}

async function openEditorImageFilesForWindow(window: BrowserWindow | null): Promise<{
  canceled: boolean
  files: EditorImageFile[]
}> {
  const response = await (window
    ? dialog.showOpenDialog(window, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
      })
    : dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
      }))

  if (response.canceled || response.filePaths.length === 0) {
    return { canceled: true, files: [] }
  }

  const files = await Promise.all(
    response.filePaths.map(async filePath => {
      const buffer = await fs.readFile(filePath)
      const extension = path.extname(filePath).toLowerCase()
      const mimeType =
        extension === '.jpg' || extension === '.jpeg'
          ? 'image/jpeg'
          : extension === '.gif'
            ? 'image/gif'
            : extension === '.webp'
              ? 'image/webp'
              : extension === '.bmp'
                ? 'image/bmp'
                : extension === '.svg'
                  ? 'image/svg+xml'
                  : 'image/png'

      return {
        name: path.basename(filePath),
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      }
    })
  )

  return { canceled: false, files }
}

export async function buildAppMenuTemplate(
  createWindow: CreateWindow,
  userDataPath: string
): Promise<Electron.MenuItemConstructorOptions[]> {
  const recentProjects = await getRecentEditorProjects(userDataPath)

  return [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            void createWindow()
          },
        },
        {
          label: 'New Project',
          accelerator: 'Shift+CmdOrCtrl+N',
          click: () => {
            sendEditorAction('new-project')
          },
        },
        {
          label: 'New Project From Clipboard',
          click: () => {
            sendEditorAction('new-project-from-clipboard')
          },
        },
        {
          label: 'New Project From Image...',
          click: () => {
            sendEditorAction('new-project-from-image')
          },
        },
        {
          label: 'Open Project From Folder',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            sendEditorAction('open-project')
          },
        },
        {
          label: 'Open Recent Project',
          submenu:
            recentProjects.length > 0
              ? recentProjects.map(project => ({
                  label: `${project.name} - ${project.projectPath}`,
                  click: (_menuItem, browserWindow) => {
                    const targetWindow =
                      browserWindow instanceof BrowserWindow ? browserWindow : BrowserWindow.getFocusedWindow()
                    sendOpenRecentProjectAction(targetWindow, project.projectPath)
                  },
                }))
              : [{ label: 'No Recent Projects', enabled: false }],
        },
        {
          label: 'Save Project',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => {
            sendEditorAction('save-project')
          },
        },
        {
          label: 'Place Image',
          click: async (_menuItem, browserWindow) => {
            const targetWindow =
              browserWindow instanceof BrowserWindow ? browserWindow : BrowserWindow.getFocusedWindow()
            if (!targetWindow) return

            const response = await openEditorImageFilesForWindow(targetWindow)
            if (response.canceled || response.files.length === 0) return

            targetWindow.webContents.send('generic:event', {
              type: 'editor-import-images',
              files: response.files,
            })
          },
        },
        {
          label: 'Save PNG',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            sendEditorAction('save-png')
          },
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          role: 'close',
        },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          role: 'quit',
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+CmdOrCtrl+I',
          role: 'toggleDevTools',
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: 'Ctrl+Command+F',
          role: 'togglefullscreen',
        },
      ],
    },
  ]
}

export async function openEditorImageFiles(window: BrowserWindow | null) {
  return await openEditorImageFilesForWindow(window)
}
