import type { Segment } from '../store/modules/workspace'
import { Button, Checkbox, Field, Input, Select, Textarea } from 'dsh-tauri-ui/client'
import { useStore } from 'dsh-tauri/client'
import { useRef, useState } from 'react'
import { locale } from '../locales'
import { changeJob, confirmAnalysis, downloadAsrModel, generateAnalysis, navigate, saveTranscript, transcribeSource } from '../service/actions'
import { workspace } from '../store/modules/workspace'
import { ModelPicker } from './model-picker'

export function SourceDetail() {
  const state = useStore(workspace)
  const [modelPath, setModelPath] = useState(state.defaultAsrModel)
  const [provider, setProvider] = useState('whisper')
  const [device, setDevice] = useState('cpu')
  const [model, setModel] = useState('')
  const [template, setTemplate] = useState('meeting')
  const [consent, setConsent] = useState(false)
  const [edited, setEdited] = useState<Segment[] | undefined>()
  const [position, setPosition] = useState(state.sourcePosition)
  const audioRef = useRef<HTMLAudioElement>(null)
  const source = state.selected
  const selectedModelPath = modelPath || state.defaultAsrModel
  if (!source)
    return null
  const t = locale.text
  const segments = edited || state.transcript?.segments || []
  function editSegment(index: number, text: string) {
    setEdited(segments.map((segment, i) => ({ ...segment, text: i === index ? text : segment.text })))
  }
  return (
    <section className="p-8 flex flex-col gap-6">
      <div>
        <Button onClick={() => navigate(state.tab)}>{t('back')}</Button>
        <h1 className="text-3xl font-semibold mt-6 mb-2">{source.title}</h1>
        <p className="text-secondary text-sm">
          {source.created_at.slice(0, 10)}
          {' '}
          ·
          {' '}
          {source.kind}
          {' '}
          ·
          {' '}
          {source.status}
        </p>
      </div>
      {['audio', 'video'].includes(source.kind) && (
        <div className="rounded-xl border border-border-l3 p-5 flex flex-col gap-4">
          <audio
            ref={audioRef}
            controls
            aria-label={t('playback')}
            src={`/api/tauri/mivo/media?id=${source.id}`}
            onLoadedMetadata={() => {
              if (audioRef.current)
                audioRef.current.currentTime = state.sourcePosition
            }}
            onTimeUpdate={() => setPosition(audioRef.current?.currentTime || 0)}
            className="w-full"
          />
          <div className="flex flex-wrap items-end gap-4">
            <Field label="ASR"><Select value={provider} onChange={setProvider} options={['whisper', 'funasr', 'sensevoice'].map(value => ({ value, label: value }))} /></Field>
            <Field label={t('modelPath')} className="flex-1"><Input aria-label={t('modelPath')} value={selectedModelPath} onChange={event => setModelPath(event.target.value)} /></Field>
            <Field label={t('device')}><Select value={device} onChange={setDevice} options={[{ value: 'cpu', label: 'CPU' }, { value: 'cuda', label: 'CUDA GPU' }]} /></Field>
            <Button disabled={state.busy || !selectedModelPath} onClick={() => void transcribeSource(provider, selectedModelPath, device)}>{t('transcribe')}</Button>
          </div>
          <p className="text-xs text-tertiary">{t('asrHint')}</p>
          {!state.defaultAsrModel && <Button disabled={state.busy} onClick={() => void downloadAsrModel()}>下载 Whisper tiny · 78.2 MB · MIT（仅下载模型，不上传资料）</Button>}
          {state.jobs.filter(job => job.source_id === source.id && job.status !== 'completed').map(job => (
            <div key={job.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                {job.kind === 'model-download' ? '模型下载' : t('transcribe')}
                {' '}
                ·
                {' '}
                {job.status}
                {' '}
                ·
                {' '}
                {Math.round(job.progress * 100)}
                %
              </span>
              <progress max={1} value={job.progress} />
              <Button disabled={state.busy} onClick={() => void changeJob(job.id, job.status)}>{['queued', 'running'].includes(job.status) ? t('pause') : t('resume')}</Button>
              {job.error && <p role="alert" className="text-error break-all">{job.error}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">{t('transcript')}</h2>
          {!state.transcript && <p className="text-secondary">{t('noTranscript')}</p>}
          {state.transcript && (
            <div className="flex flex-col gap-4">
              <Button
                disabled={!edited || state.busy}
                onClick={async () => {
                  if (edited) {
                    await saveTranscript(edited, state.transcript!.revision)
                    if (!workspace.error)
                      setEdited(undefined)
                  }
                }}
              >
                {t('edit')}
              </Button>
              {segments.map((segment, index) => (
                <div key={`${segment.start}-${segment.end}-${index}`} className={position >= segment.start && position < segment.end ? 'rounded-lg border border-border-l3 p-3 bg-layer-3' : 'rounded-lg border border-border-l3 p-3'}>
                  <Button
                    variant="link"
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = segment.start
                        void audioRef.current.play()
                      }
                    }}
                  >
                    {segment.start.toFixed(1)}
                    –
                    {segment.end.toFixed(1)}
                    s
                    {' '}
                    {segment.speaker || ''}
                  </Button>
                  <Textarea size="short" aria-label={`${t('segments')} ${index + 1}`} value={segment.text} onChange={event => editSegment(index, event.target.value)} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t('cloud')}</h2>
          <ModelPicker value={model} onChange={setModel} />
          <Select value={template} onChange={setTemplate} label={t('analysisTemplate')} options={['meeting', 'insight', 'strategy', 'critical', 'actions', 'knowledge', 'content', 'review'].map(value => ({ value, label: t(value === 'knowledge' ? 'extraction' : value as 'meeting') }))} />
          <Checkbox checked={consent} onChange={setConsent}>{t('consent')}</Checkbox>
          <Button
            variant="add"
            disabled={!consent || !model || !state.transcript || state.busy}
            onClick={async () => {
              await generateAnalysis(model, template, consent)
              setConsent(false)
            }}
          >
            {state.busy ? t('busy') : t('analyze')}
          </Button>
          <h2 className="text-xl font-semibold mt-6">{t('analysis')}</h2>
          {state.analyses.map(item => (
            <article key={item.id} className="border border-border-l3 rounded-xl p-5 flex flex-col gap-3">
              <small className="text-tertiary">
                {item.payload.model}
                {' '}
                · v
                {item.payload.transcript_revision}
              </small>
              <p className="whitespace-pre-wrap leading-relaxed">{item.payload.summary}</p>
              {(['people', 'projects', 'viewpoints', 'decisions', 'tasks', 'topics'] as const).map(key => item.payload[key].length > 0 && (
                <div key={key}>
                  <strong>{t(key)}</strong>
                  <ul className="list-disc pl-5">{item.payload[key].map((value, index) => <li key={`${index}-${value}`}>{value}</li>)}</ul>
                </div>
              ))}
              <p className="text-sm text-secondary">
                {t('provenance')}
                :
                {' '}
                {item.payload.evidence.map(index => `#${index + 1}`).join(', ')}
              </p>
              <Button variant="add" disabled={Boolean(item.confirmed) || state.busy} onClick={() => void confirmAnalysis(item.id)}>{item.confirmed ? t('confirmed') : t('confirm')}</Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
