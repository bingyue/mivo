import type { ToolDefinition } from 'dsh-tauri'
import { z } from 'zod'
import { runtime } from '../config/runtime'
import { core } from '../service/core'

export function searchTool(): ToolDefinition {
  return {
    name: 'mivo_search_memories',
    description: 'Search user-confirmed Mivo memories with source references. Read only.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    output: { schema: { type: 'array', items: { type: 'object', additionalProperties: true } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const input = z.object({ query: z.string().min(1).max(500) }).strict().parse(args)
      const scope = runtime.approvedSessions.get(exec.agent?.id || '')
      if (!scope)
        throw new Error('CLOUD_CONSENT_REQUIRED')
      const results = await Promise.all([...scope.sources].map(source_id => core.json('/search', { ...input, source_id, limit: 10 }, exec.signal)))
      return results.flat().filter(row => scope.memories.has(row.memory_id)).slice(0, 10)
    },
    isConcurrencySafe: () => true,
  }
}
