import type { ChildProcess } from 'node:child_process'

export const runtime = {
  child: undefined as ChildProcess | undefined,
  connection: undefined as {
    url: string
    token: string
  } | undefined,
  starting: undefined as Promise<void> | undefined,
  approvedSessions: new Map<string, {
    sources: Set<string>
    memories: Set<string>
  }>(),
}
