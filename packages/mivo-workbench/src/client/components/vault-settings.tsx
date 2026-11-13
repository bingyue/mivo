import { Button, Checkbox, Field, Input } from 'dsh-tauri-ui/client'
import { useStore } from 'dsh-tauri/client'
import { useState } from 'react'
import { locale } from '../locales'
import { createVault, indexKnowledge, maintainVault } from '../service/actions'
import { workspace } from '../store/modules/workspace'

export function VaultSettings() {
  const state = useStore(workspace)
  const [consent, setConsent] = useState(false)
  const [vault, setVault] = useState(state.vault)
  const t = locale.text
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">{t('vaultPath')}</h2>
        <p className="text-secondary my-3 break-all">{state.vault}</p>
        <div className="flex items-end gap-3 mb-4">
          <Field label="切换到其他 Vault" className="flex-1"><Input value={vault} onChange={event => setVault(event.target.value)} /></Field>
          <Button disabled={!vault || vault === state.vault || state.busy} onClick={() => void createVault(vault)}>{t('createVault')}</Button>
        </div>
        <div className="flex flex-wrap gap-3">{[['backup', '/backups'], ['export', '/exports'], ['reindex', '/reindex']].map(([label, path]) => <Button key={path} disabled={state.busy} onClick={() => void maintainVault(path)}>{t(label as 'backup')}</Button>)}</div>
        <p className="text-sm text-secondary mt-4 leading-relaxed">{t('storageHint')}</p>
      </div>
      <div className="border-t border-border-l3 pt-6 flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t('embedding')}</h2>
        <p className="text-sm text-secondary leading-relaxed">{t('embeddingHint')}</p>
        <Checkbox checked={consent} onChange={setConsent}>{t('embeddingConsent')}</Checkbox>
        <Button
          disabled={!consent || state.busy}
          onClick={async () => {
            await indexKnowledge(consent)
            setConsent(false)
          }}
        >
          {t('indexEmbeddings')}
        </Button>
      </div>
      <div className="border-t border-border-l3 pt-6">
        <h2 className="text-xl font-semibold">MCP</h2>
        <p className="text-sm text-secondary leading-relaxed my-3">{t('mcpHint')}</p>
        <p className="text-sm my-3">{t('mcpConfig')}</p>
        <pre className="overflow-auto p-5 rounded-lg bg-layer-3 text-xs">{JSON.stringify({ mcpServers: { mivo: { command: state.coreExecutable || 'mivo-core', args: ['--mcp', '--vault', state.vault] } } }, null, 2)}</pre>
      </div>
      <div className="text-sm text-secondary border-t border-border-l3 pt-6">
        Mivo 0.1.0 · Personal noncommercial
        <br />
        Powered by DeepSeek Harness · 原始版权与附加许可随安装包保留。
      </div>
    </div>
  )
}
