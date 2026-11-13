import type { IncomingMessage } from 'node:http'
import { defineWebServer } from 'dsh-h3'
import { guard } from 'dsh-tauri'
import { defineEventHandler, getQuery } from 'h3'
import { core } from '../service/core'

export const media = defineWebServer((app) => {
  app.use(guard)
  app.get('/api/tauri/mivo/media', defineEventHandler(async (event) => {
    const request = event.runtime?.node?.req as IncomingMessage | undefined
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request?.socket.remoteAddress || '')) {
      event.res.status = 403
      return { error: 'MIVO_REQUIRES_LOCAL_CONNECTION' }
    }
    const query = getQuery<{ id: string }>(event)
    if (!/^[a-f0-9]{32}$/.test(query.id))
      throw new Error('INVALID_SOURCE_ID')
    const headers: Record<string, string> = {}
    const range = event.req.headers.get('range')
    if (range)
      headers.Range = range
    return core.request(`/sources/${query.id}/original`, { headers })
  }))
})
