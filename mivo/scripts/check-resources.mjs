import './distribution-guard.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const resources = resolve(root, 'apps/desktop/src-tauri/resources')
const executable = process.platform === 'win32' ? 'mivo-core.exe' : 'mivo-core'
if (existsSync(resolve(resources, 'mivo/models'))) throw new Error('ASR models must not be bundled; move them outside resources')
for (const path of [`mivo/core/mivo-core/${executable}`, 'pnpm/bin/pnpm.cjs', 'dsh', 'mivo/licenses/MIVO-THIRD_PARTY_NOTICES.md']) {
  if (!existsSync(resolve(resources, path))) throw new Error(`MIVO_RESOURCE_MISSING: ${path}; run pnpm mivo:prepare`)
}
const config = JSON.parse(readFileSync(resolve(root, 'apps/desktop/src-tauri/tauri.conf.json')))
if (config.identifier !== 'com.mivo.desktop') throw new Error('MIVO_IDENTITY_MISMATCH')
