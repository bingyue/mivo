import { defineStore } from 'dsh-tauri/client'

export interface Source {
  id: string
  title: string
  kind: string
  status: string
  created_at: string
  transcript_revision: number
}
export interface Segment {
  text: string
  start: number
  end: number
  speaker?: string
}
export interface Transcript {
  revision: number
  text: string
  segments: Segment[]
}
export interface Analysis {
  id: string
  confirmed: number
  payload: {
    summary: string
    people: string[]
    projects: string[]
    topics: string[]
    decisions: string[]
    tasks: string[]
    viewpoints: string[]
    evidence: number[]
    model: string
    transcript_revision: number
  }
}
export interface Memory {
  id: string
  title: string
  source_id: string
  markdown?: string
}
export interface Job {
  id: string
  source_id: string
  kind: string
  status: string
  progress: number
  error?: string
}
export interface Hit {
  id: string
  title: string
  source_id: string
  text: string
  start: number
  end: number
  reference: string
}
export interface Provider {
  id: string
  name: string
  models: {
    id: string
    name?: string
  }[]
}
const initialState = {
  tab: 'home',
  recording: false,
  recordCommand: 0,
  coreExecutable: '',
  defaultAsrModel: '',
  vault: '',
  loading: true,
  busy: false,
  error: '',
  info: '',
  sources: [] as Source[],
  memories: [] as Memory[],
  jobs: [] as Job[],
  providers: [] as Provider[],
  selected: undefined as Source | undefined,
  sourcePosition: 0,
  transcript: undefined as Transcript | undefined,
  analyses: [] as Analysis[],
  hits: [] as Hit[],
  answer: '',
  memory: undefined as Memory | undefined,
}
export const workspace = defineStore({
  state: () => initialState,
  actions: {
    patch(value: Partial<typeof initialState>) {
      Object.assign(this, value)
    },
  },
})
