import type { Analysis, Hit, Job, Memory, Provider, Source, Transcript } from '../store/modules/workspace'
import { getModels, getSettings } from '../apis'
import { coreRequest } from '../apis/transport'
import { workspace } from '../store/modules/workspace'

export async function loadWorkspace() {
  try {
    const settings = await getSettings()
    workspace.patch({ vault: settings.vault, coreExecutable: settings.coreExecutable, loading: false })
    if (!settings.vault)
      return
    const [sources, memories, jobs, providers, health] = await Promise.all([
      coreRequest<Source[]>('/sources'),
      coreRequest<Memory[]>('/memories'),
      coreRequest<Job[]>('/jobs'),
      getModels(),
      coreRequest<{
        default_asr_model: string
      }>('/health'),
    ])
    workspace.patch({ sources, memories, jobs, providers: providers as Provider[], defaultAsrModel: health.default_asr_model })
    const selected = sources.find(source => source.id === workspace.selected?.id)
    if (selected && selected.transcript_revision !== workspace.transcript?.revision && selected.transcript_revision > 0)
      await selectSource(selected)
  }
  catch (error) {
    workspace.patch({ error: String(error), loading: false })
  }
}
export async function selectSource(source: Source, position = 0) {
  workspace.patch({ selected: source, sourcePosition: position, transcript: undefined, analyses: [], memory: undefined })
  try {
    const analyses = await coreRequest<Analysis[]>(`/analyses?source_id=${source.id}`)
    const transcript = source.transcript_revision ? await coreRequest<Transcript>(`/sources/${source.id}/transcript`) : undefined
    if (workspace.selected?.id === source.id)
      workspace.patch({ transcript, analyses })
  }
  catch (error) {
    workspace.patch({ error: String(error) })
  }
}
export async function runAction(action: () => Promise<unknown>) {
  if (workspace.busy)
    return
  workspace.patch({ busy: true, error: '', info: '' })
  try {
    const result = await action()
    await loadWorkspace()
    if (workspace.selected) {
      const selected = workspace.sources.find(s => s.id === workspace.selected?.id)
      if (selected)
        await selectSource(selected)
    }
    return result
  }
  catch (error) {
    workspace.patch({ error: String(error) })
  }
  finally {
    workspace.patch({ busy: false })
  }
}
export async function searchKnowledge(query: string) {
  const hits = await coreRequest<Hit[]>('/search', 'POST', { query, limit: 10 })
  workspace.patch({ hits })
}
