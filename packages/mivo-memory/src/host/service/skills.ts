import type {} from '@deepseek-ai/dsh-skill-filesystem'
import type { HostContext } from 'dsh-tauri'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getServerContext } from 'dsh-h3/utils'
import { defineService } from 'dsh-tauri'
import { server } from '../server'

export const skills = defineService({
  register() {
    const ctx = getServerContext<HostContext>(server)
    const root = join(import.meta.dirname, '../../mivo-bundle/skills')
    for (const name of readdirSync(root)) {
      const path = join(root, name, 'SKILL.md')
      const raw = readFileSync(path, 'utf8')
      const description = raw.match(/^description: (.+)$/m)?.[1] || name
      ctx.skills.register({ name, description, source: 'bundled', path, content: raw.replace(/^---[\s\S]*?---\s*/, ''), resourceBase: { kind: 'directory', path: join(root, name) } })
    }
  },
})
