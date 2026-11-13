import { Button, Field, Input, Textarea } from 'dsh-tauri-ui/client'
import { useStore } from 'dsh-tauri/client'
import { useRef, useState } from 'react'
import { locale } from '../locales'
import { changeJob, createNote, importSources, requestRecording } from '../service/actions'
import { selectSource } from '../service/workspace'
import { workspace } from '../store/modules/workspace'

export function Capture() {
  const state = useStore(workspace)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const t = locale.text
  const sources = state.sources.filter(source => state.tab !== 'recordings' || ['audio', 'video'].includes(source.kind))
  return (
    <div className="flex flex-col gap-6">
      {state.tab === 'home' && (
        <div className="grid grid-cols-3 gap-4">
          {[[t('sources'), state.sources.length], [t('memories'), state.memories.length], [t('jobs'), state.jobs.filter(job => job.status !== 'completed').length]].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border-l3 p-5">
              <small className="text-tertiary">{label}</small>
              <div className="text-4xl font-semibold mt-3">{value}</div>
            </div>
          ))}
        </div>
      )}
      <div
        className="rounded-xl border border-dashed border-border-l3 p-7 bg-layer-2"
        onDragOver={event => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void importSources(Array.from(event.dataTransfer.files))
        }}
      >
        <h2 className="text-xl font-semibold">{t('empty')}</h2>
        <p className="text-secondary text-sm my-3">{t('emptyHint')}</p>
        <input
          ref={fileRef}
          hidden
          type="file"
          multiple
          onChange={(event) => {
            void importSources(Array.from(event.target.files || []))
            event.target.value = ''
          }}
        />
        <div className="flex gap-3">
          <Button variant="add" disabled={state.busy} onClick={() => fileRef.current?.click()}>{t('import')}</Button>
          <Button disabled={state.busy} onClick={requestRecording}>{state.recording ? t('stopRecord') : t('startRecord')}</Button>
        </div>
        {state.recording && <p role="status" className="text-error mt-3">{t('recordingHint')}</p>}
      </div>
      {state.tab === 'inbox' && (
        <div className="rounded-xl border border-border-l3 p-5 flex flex-col gap-3">
          <h2 className="font-semibold">{t('note')}</h2>
          <Field label={t('noteTitle')}><Input placeholder={t('noteTitle')} value={title} onChange={event => setTitle(event.target.value)} /></Field>
          <Textarea size="short" placeholder={t('noteText')} value={text} onChange={event => setText(event.target.value)} />
          <Button
            disabled={!title.trim() || !text.trim() || state.busy}
            onClick={async () => {
              await createNote(title, text)
              if (!workspace.error)
                setText('')
            }}
          >
            {t('save')}
          </Button>
        </div>
      )}
      <div>
        {sources.map(source => (
          <div key={source.id} className="border-b border-border-l3 py-4 flex justify-between gap-4 items-center">
            <Button variant="link" onClick={() => void selectSource(source)}>{source.title}</Button>
            <small className="text-tertiary">
              {source.kind}
              {' '}
              ·
              {' '}
              {source.status}
              {' '}
              ·
              {' '}
              {source.created_at.slice(0, 10)}
            </small>
          </div>
        ))}
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-4">{t('jobs')}</h2>
        {state.jobs.length === 0 && <p className="text-sm text-tertiary">{t('noJobs')}</p>}
        {state.jobs.map(job => (
          <div key={job.id} className="border border-border-l3 rounded-lg p-4 mb-3">
            <p className="text-sm break-words">
              {job.status}
              {' '}
              ·
              {' '}
              {Math.round(job.progress * 100)}
              %
              {' '}
              {job.error}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <progress max={1} value={job.progress} />
              <Button disabled={state.busy || job.status === 'completed'} onClick={() => void changeJob(job.id, job.status)}>{['queued', 'running'].includes(job.status) ? t('pause') : t('resume')}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
