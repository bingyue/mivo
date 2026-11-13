import type { ToolDefinition } from 'dsh-tauri'
import { z } from 'zod'
import { runtime } from '../config/runtime'
import { core } from '../service/core'

export function memoryTool(): ToolDefinition {
  return {
    name: 'mivo_get_memory',
    description: 'Read user-confirmed knowledge and its evidence. Read only.',
    parameters: { type: 'object', properties: { memory_id: { type: 'string' } }, required: ['memory_id'], additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const input = z.object({ memory_id: z.string().regex(/^[a-f0-9]{32}$/) }).strict().parse(args)
      if (!runtime.approvedSessions.get(exec.agent?.id || '')?.memories.has(input.memory_id))
        throw new Error('MEMORY_OUTSIDE_CLOUD_CONSENT')
      const result = await core.json(`/memories/${input.memory_id}`, undefined, exec.signal)
      if (JSON.stringify(result).length > 30000)
        throw new Error('MEMORY_TOO_LARGE: use search')
      return result
    },
    isConcurrencySafe: () => true,
  }
}
