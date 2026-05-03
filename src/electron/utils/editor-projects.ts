import fs from 'fs/promises'
import path from 'path'
import {
  EditorProjectFile,
  EditorProjectSaveRequest,
  editorProjectFileSchema,
  editorProjectSaveRequestSchema,
  recentEditorProjectSchema,
  RecentEditorProject,
} from '../../common/EditorProject.js'

const PROJECT_FILE_NAME = 'project.json'
const RECENTS_FILE_NAME = 'editor-recent-projects.json'

function getProjectFilePath(projectPath: string) {
  return path.join(projectPath, PROJECT_FILE_NAME)
}

function getRecentsFilePath(userDataPath: string) {
  return path.join(userDataPath, RECENTS_FILE_NAME)
}

export async function loadEditorProject(projectPath: string): Promise<EditorProjectFile> {
  const raw = await fs.readFile(getProjectFilePath(projectPath), 'utf8')
  return editorProjectFileSchema.parse(JSON.parse(raw))
}

export async function saveEditorProject(projectPath: string, request: EditorProjectSaveRequest): Promise<void> {
  const validated = editorProjectSaveRequestSchema.parse(request)
  await fs.mkdir(projectPath, { recursive: true })

  for (const asset of validated.assetContents) {
    const assetMeta = validated.project.assets[asset.assetId]
    if (!assetMeta) {
      throw new Error(`Missing asset metadata for ${asset.assetId}`)
    }

    const assetPath = path.join(projectPath, assetMeta.relativePath)
    await fs.mkdir(path.dirname(assetPath), { recursive: true })
    await fs.writeFile(assetPath, Buffer.from(asset.dataBase64, 'base64'))
  }

  await fs.writeFile(getProjectFilePath(projectPath), JSON.stringify(validated.project, null, 2), 'utf8')
}

export async function loadEditorProjectAsset(projectPath: string, assetId: string): Promise<string> {
  const project = await loadEditorProject(projectPath)
  const asset = project.assets[assetId]
  if (!asset) {
    throw new Error(`Could not find asset ${assetId}`)
  }

  const assetPath = path.join(projectPath, asset.relativePath)
  const buffer = await fs.readFile(assetPath)
  return `data:${asset.mimeType};base64,${buffer.toString('base64')}`
}

export async function getRecentEditorProjects(userDataPath: string): Promise<RecentEditorProject[]> {
  const recentsPath = getRecentsFilePath(userDataPath)

  try {
    const raw = await fs.readFile(recentsPath, 'utf8')
    const parsed = JSON.parse(raw)
    return recentEditorProjectSchema.array().parse(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    console.error('Failed to read recent editor projects', error)
    return []
  }
}

export async function rememberRecentEditorProject(userDataPath: string, projectPath: string, name: string): Promise<void> {
  const recentsPath = getRecentsFilePath(userDataPath)
  const current = await getRecentEditorProjects(userDataPath)
  const updatedAt = new Date().toISOString()
  const next = [
    { projectPath, name, updatedAt },
    ...current.filter(project => project.projectPath !== projectPath),
  ].slice(0, 12)

  await fs.mkdir(path.dirname(recentsPath), { recursive: true })
  await fs.writeFile(recentsPath, JSON.stringify(next, null, 2), 'utf8')
}
