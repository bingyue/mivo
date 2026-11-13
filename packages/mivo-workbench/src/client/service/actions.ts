import type { Memory, Segment } from '../store/modules/workspace'
import { postAnalysis, putSettings } from '../apis'
import { coreRequest, uploadFiles } from '../apis/transport'
import { workspace } from '../store/modules/workspace'
import { runAction } from './workspace'

export function navigate(tab: string) {
  workspace.patch({ tab, selected: undefined, error: '', info: '' })
}
export async function createVault(vault: string) {
  return runAction(() => putSettings({ vault }))
}
export async function importSources(files: File[]) {
  return runAction(() => uploadFiles(files))
}
export async function createNote(title: string, text: string) {
  return runAction(() => coreRequest('/sources/text', 'POST', { title, text }))
}
export async function saveTranscript(segments: Segment[], revision: number) {
  const id = workspace.selected?.id
  if (id)
    return runAction(() => coreRequest(`/sources/${id}/transcript`, 'PUT', { segments, expected_revision: revision }))
}
export async function transcribeSource(provider: string, model_path: string, device: string) {
  const id = workspace.selected?.id
  if (id)
    return runAction(() => coreRequest(`/sources/${id}/transcribe`, 'POST', { provider, model_path, device }))
}
export async function downloadAsrModel() {
  const id = workspace.selected?.id
  if (id)
    return runAction(() => coreRequest(`/sources/${id}/model`, 'POST', { confirmed: true }))
}
export async function generateAnalysis(model: string, template: string, consent: boolean) {
  const [provider, selectedModel] = model.split('\n')
  return runAction(() => postAnalysis({ consent, provider, model: selectedModel, sourceId: workspace.selected?.id, template }, { timeout: 200000 }))
}
export async function confirmAnalysis(id: string) {
  return runAction(() => coreRequest(`/analyses/${id}/confirm`, 'POST', { confirmed: true }))
}
export async function changeJob(id: string, status: string) {
  return runAction(() => coreRequest(`/jobs/${id}`, 'POST', { action: ['queued', 'running'].includes(status) ? 'pause' : 'resume' }))
}
export async function openMemory(id: string) {
  return runAction(async () => {
    workspace.patch({ memory: await coreRequest<Memory>(`/memories/${id}`) })
  })
}
export async function askMemory(question: string, model: string, consent: boolean, semantic: boolean) {
  const [provider, selectedModel] = model.split('\n')
  return runAction(async () => {
    const result = await postAnalysis({ consent, provider, model: selectedModel, question, semantic }, { timeout: 200000 }) as {
      answer: string
      sources: typeof workspace.hits
    }
    workspace.patch({ answer: result.answer, hits: result.sources })
  })
}
export async function maintainVault(path: string) {
  return runAction(async () => {
    const result = await coreRequest<{
      path?: string
    }>(path, 'POST')
    workspace.patch({ info: result.path ? `${workspace.vault}/${result.path}` : '已完成' })
  })
}
export async function indexKnowledge(consent: boolean) {
  return runAction(async () => {
    const result = await coreRequest<{
      indexed: number
    }>('/embeddings', 'POST', { consent })
    workspace.patch({ info: `已建立 ${result.indexed} 个知识片段的向量索引` })
  })
}
export function requestRecording() {
  workspace.patch({ recordCommand: workspace.recordCommand + 1 })
}
