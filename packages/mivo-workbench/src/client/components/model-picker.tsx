import { Field, Select } from 'dsh-tauri-ui/client'
import { useStore } from 'dsh-tauri/client'
import { locale } from '../locales'
import { workspace } from '../store/modules/workspace'

export function ModelPicker({ value, onChange }: {
  value: string
  onChange: (value: string) => void
}) {
  const state = useStore(workspace)
  const t = locale.text
  const options = [{ value: '', label: t('chooseModel') }, ...state.providers.flatMap(provider => provider.models.map(model => ({
    value: `${provider.id}\n${model.id}`,
    label: `${provider.name} / ${model.name || model.id}`,
  })))]
  return (
    <div className="flex flex-col gap-3">
      <p className="text-secondary text-sm leading-relaxed">{t('modelHint')}</p>
      <Field label={t('chooseModel')}><Select value={value} onChange={onChange} options={options} label={t('chooseModel')} /></Field>
    </div>
  )
}
