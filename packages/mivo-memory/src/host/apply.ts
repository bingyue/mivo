import type { HostContext } from 'dsh-tauri'
import { runtime } from './config/runtime'
import { server } from './server'
import { media } from './server/media'
import { core } from './service/core'
import { skills } from './service/skills'
import { memoryTool } from './tools/memory'
import { searchTool } from './tools/search'
import { transcriptTool } from './tools/transcript'

export function apply(ctx: HostContext): void {
  ctx.effect(() => server(ctx), 'mivo: routes')
  ctx.effect(() => media(ctx), 'mivo: media')
  skills.register()
  ctx.effect(() => () => core.stop(), 'mivo: core lifecycle')
  ctx.tools.register(searchTool(), { when: ({ agent }) => runtime.approvedSessions.has(agent.id) })
  ctx.tools.register(transcriptTool(), { when: ({ agent }) => runtime.approvedSessions.has(agent.id) })
  ctx.tools.register(memoryTool(), { when: ({ agent }) => runtime.approvedSessions.has(agent.id) })
}
