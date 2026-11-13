import { Button } from 'dsh-tauri-ui/client'
import { useStore } from 'dsh-tauri/client'
import { locale } from '../locales'
import { openMemory } from '../service/actions'
import { selectSource } from '../service/workspace'
import { workspace } from '../store/modules/workspace'

export function Knowledge() {
  const state = useStore(workspace)
  const source = state.sources.find(item => item.id === state.memory?.source_id)
  return (
    <div className="flex flex-col gap-4">
      {state.memories.length === 0 && <p className="text-secondary">{locale.text('noMemories')}</p>}
      {state.memories.map(memory => <div key={memory.id} className="border-b border-border-l3 pb-3"><Button variant="link" onClick={() => void openMemory(memory.id)}>{memory.title}</Button></div>)}
      {state.memory && (
        <article className="rounded-xl border border-border-l3 p-6">
          {source && <Button onClick={() => void selectSource(source)}>{locale.text('openSource')}</Button>}
          <div className="whitespace-pre-wrap leading-relaxed mt-5">{state.memory.markdown}</div>
        </article>
      )}
    </div>
  )
}
