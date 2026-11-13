import type { ToolDefinition } from 'dsh-tauri'
import { z } from 'zod'
import { runtime } from '../config/runtime'
import { core } from '../service/core'

export function transcriptTool(): ToolDefinition {
  return {
    name: 'mivo_get_transcript',
    description: 'Read a Mivo source transcript, capped at 20000 characters. Read only.',
    parameters: { type: 'object', properties: { source_id: { type: 'string' } }, required: ['source_id'], additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const input = z.object({ source_id: z.string().regex(/^[a-f0-9]{32}$/) }).strict().parse(args)
      if (!runtime.approvedSessions.get(exec.agent?.id || '')?.sources.has(input.source_id))
        throw new Error('SOURCE_OUTSIDE_CLOUD_CONSENT')
      const result = await core.json(`/sources/${input.source_id}/transcript`, undefined, exec.signal)
      if (JSON.stringify(result).length > 20000)
        throw new Error('TRANSCRIPT_TOO_LARGE: use memory search')
      return { ...result, reference: `mivo://source/${input.source_id}` }
    },
    isConcurrencySafe: () => true,
  }
}
