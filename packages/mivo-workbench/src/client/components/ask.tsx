import { Button, Checkbox, Textarea } from 'dsh-tauri-ui/client'
import { useStore } from 'dsh-tauri/client'
import { useState } from 'react'
import { locale } from '../locales'
import { askMemory } from '../service/actions'
import { runAction, searchKnowledge, selectSource } from '../service/workspace'
import { workspace } from '../store/modules/workspace'
import { ModelPicker } from './model-picker'

export function Ask() {
  const state = useStore(workspace)
  const [query, setQuery] = useState('')
  const [model, setModel] = useState('')
  const [consent, setConsent] = useState(false)
  const [semantic, setSemantic] = useState(false)
  const t = locale.text
  return (
    <div className="flex flex-col gap-5">
      <Textarea size="short" placeholder={t('question')} value={query} onChange={event => setQuery(event.target.value)} />
      <Button disabled={!query || state.busy} onClick={() => void runAction(() => searchKnowledge(query))}>{t('search')}</Button>
      <div className="rounded-xl border border-border-l3 p-5 flex flex-col gap-4">
        <ModelPicker value={model} onChange={setModel} />
        <Checkbox checked={semantic} onChange={setSemantic}>{t('semantic')}</Checkbox>
        <Checkbox checked={consent} onChange={setConsent}>{t('qaConsent')}</Checkbox>
        <Button
          variant="add"
          disabled={!query || !model || !consent || state.busy}
          onClick={async () => {
            await askMemory(query, model, consent, semantic)
            setConsent(false)
          }}
        >
          {t('answer')}
        </Button>
      </div>
      {state.answer && <article className="whitespace-pre-wrap leading-relaxed rounded-xl bg-layer-3 p-6">{state.answer}</article>}
      <h2 className="text-xl font-semibold">{t('results')}</h2>
      {state.hits.length === 0 && <p className="text-secondary">{t('noHits')}</p>}
      {state.hits.map(hit => (
        <article key={hit.id} className="border-t border-border-l3 py-4">
          <Button
            variant="link"
            onClick={() => {
              const source = state.sources.find(item => item.id === hit.source_id)
              if (source)
                void selectSource(source, hit.start)
            }}
          >
            {hit.title}
            {' '}
            [
            {hit.start}
            –
            {hit.end}
            s]
          </Button>
          <p className="whitespace-pre-wrap text-sm leading-relaxed mt-3">{hit.text}</p>
          <small className="text-tertiary">{hit.reference}</small>
        </article>
      ))}
    </div>
  )
}
