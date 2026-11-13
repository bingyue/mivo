import type { IncomingMessage } from 'node:http'
import { defineWebServer } from 'dsh-h3'
import { guard } from 'dsh-tauri'
import { defineEventHandler, readBody } from 'h3'
import { agent } from '../service/agent'
import { core } from '../service/core'

export const server = defineWebServer((app) => {
  app.use(guard)
  app.use((event, next) => {
    const request = event.runtime?.node?.req as IncomingMessage | undefined
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request?.socket.remoteAddress || '')) {
      event.res.status = 403
      return { error: 'MIVO_REQUIRES_LOCAL_CONNECTION' }
    }
    return next()
  })
  app.get('/api/tauri/mivo/settings', defineEventHandler(() => core.settings()))
  app.put('/api/tauri/mivo/settings', defineEventHandler(async (event) => {
    const body = await readBody<{
      vault: string
    }>(event)
    if (!body || typeof body.vault !== 'string')
      throw new Error('INVALID_VAULT')
    return core.configure(body.vault)
  }))
  app.get('/api/tauri/mivo/models', defineEventHandler(() => agent.models()))
  app.post('/api/tauri/mivo/analysis', defineEventHandler(async (event) => {
    const body = await readBody<{
      consent: boolean
      provider: string
      model: string
      sourceId?: string
      question?: string
      template?: string
      semantic?: boolean
    }>(event)
    return agent.analyze(body)
  }))
  app.post('/api/tauri/mivo/core', defineEventHandler(async (event) => {
    const body = await readBody<{
      path: string
      method?: string
      data?: unknown
    }>(event)
    if (!body)
      throw new Error('BODY_REQUIRED')
    const method = body.method || 'GET'
    const allowed: Record<string, RegExp> = {
      GET: /^\/(health|sources|jobs|analyses|memories|sources\/[a-f0-9]+(?:\/transcript)?|memories\/[a-f0-9]+)(?:\?source_id=[a-f0-9]+)?$/,
      POST: /^\/(sources\/text|sources\/[a-f0-9]+\/(?:transcribe|model)|jobs\/[a-f0-9]+|analyses\/[a-f0-9]+\/confirm|search(?:\/hybrid)?|embeddings|reindex|exports|backups)$/,
      PUT: /^\/sources\/[a-f0-9]+\/transcript$/,
    }
    if (!allowed[method]?.test(body.path))
      throw new Error('CORE_ROUTE_NOT_ALLOWED')
    const response = await core.request(body.path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body.data || {}) })
    event.res.status = response.status
    return response.json()
  }))
  app.post('/api/tauri/mivo/upload', defineEventHandler(async (event) => {
    const type = event.req.headers.get('content-type') || ''
    if (!type.startsWith('multipart/form-data;'))
      throw new Error('MULTIPART_REQUIRED')
    const payload = await event.req.arrayBuffer()
    if (payload.byteLength > 1024 ** 3)
      throw new Error('FILE_TOO_LARGE')
    const response = await core.request('/sources/upload', { method: 'POST', headers: { 'Content-Type': type }, body: payload })
    event.res.status = response.status
    return response.json()
  }))
})
