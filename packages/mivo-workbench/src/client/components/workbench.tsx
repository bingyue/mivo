import { Button, Field, Input } from 'dsh-tauri-ui/client'
import { useStore } from 'dsh-tauri/client'
import { useState } from 'react'
import { locale } from '../locales'
import { createVault, navigate } from '../service/actions'
import { loadWorkspace } from '../service/workspace'
import { workspace } from '../store/modules/workspace'
import { Ask } from './ask'
import { Capture } from './capture'
import { Knowledge } from './knowledge'
import { SourceDetail } from './source-detail'
import { VaultSettings } from './vault-settings'

export function Workbench() {
  const state = useStore(workspace)
  const [vault, setVault] = useState('')
  const t = locale.text
  const tabs = ['home', 'inbox', 'recordings', 'knowledge', 'ask', 'settings'] as const
  if (state.loading)
    return <p className="p-8">{t('busy')}</p>
  if (!state.vault) {
    return (
      <main className="max-w-xl mx-auto p-10 mt-20 flex flex-col gap-6">
        <span className="text-sm text-tertiary tracking-widest">YOUR PERSONAL AI MEMORY</span>
        <h1 className="text-6xl font-semibold tracking-tight">
          Mivo
          <span className="text-success">.</span>
        </h1>
        <h2 className="text-2xl">{t('welcome')}</h2>
        <p className="leading-relaxed text-secondary">{t('intro')}</p>
        <Field label={t('vaultPath')}><Input value={vault} onChange={event => setVault(event.target.value)} placeholder="/Users/you/Documents/MivoVault" /></Field>
        <Button variant="add" disabled={!vault || state.busy} onClick={() => void createVault(vault)}>{t('createVault')}</Button>
        {state.error && <p role="alert" className="text-error">{state.error}</p>}
      </main>
    )
  }
  return (
    <main data-dsh-mivo-workbench className="h-full flex text-primary bg-layer-1">
      <aside className="w-[200px] shrink-0 p-5 border-r border-border-l3 flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight mt-3">
          Mivo
          <span className="text-success">.</span>
        </h1>
        <small className="text-tertiary mb-6">{t('local')}</small>
        {tabs.map(tab => <Button key={tab} variant={state.tab === tab ? 'elevated' : 'ghost'} onClick={() => navigate(tab)}>{t(tab)}</Button>)}
        <div className="flex-1" />
        <small className="text-tertiary break-all leading-relaxed">{t('confirmHint')}</small>
      </aside>
      <div className="flex-1 min-w-0 overflow-auto">
        {state.error && (
          <div role="alert" className="p-5 text-error whitespace-pre-wrap">
            {t('failed')}
            :
            {' '}
            {state.error}
          </div>
        )}
        {state.info && <p role="status" className="p-5 break-all text-success">{state.info}</p>}
        {state.selected
          ? <SourceDetail key={state.selected.id} />
          : (
              <section className="max-w-6xl p-10 mx-auto">
                <header className="flex justify-between items-center gap-5 mb-8">
                  <div>
                    <h1 className="text-3xl font-semibold mb-3">{t(state.tab as 'home')}</h1>
                    <p className="text-secondary text-sm">{t('tagline')}</p>
                  </div>
                  <Button disabled={state.busy} onClick={() => void loadWorkspace()}>{t('refresh')}</Button>
                </header>
                {['home', 'inbox', 'recordings'].includes(state.tab) && <Capture />}
                {state.tab === 'knowledge' && <Knowledge />}
                {state.tab === 'ask' && <Ask />}
                {state.tab === 'settings' && <VaultSettings />}
              </section>
            )}
      </div>
    </main>
  )
}
