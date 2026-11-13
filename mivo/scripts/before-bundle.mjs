import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const runtime = join(root, 'apps/desktop/src-tauri/target/electron')
const candidates = readdirSync(runtime).flatMap(platform => {
  const directory = join(runtime, platform)
  const manifest = join(directory, 'electron-rs.json')
  return existsSync(manifest) ? [join(directory, JSON.parse(readFileSync(manifest, 'utf8')).binary)] : []
})
const electron = candidates.find(path => existsSync(path))
if (!electron) throw new Error('Bundled Electron is required to inventory runtime licenses')
const inventory = spawnSync(electron, [join(root, 'mivo/scripts/license-inventory.mjs')], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit',
})
if (inventory.error) throw inventory.error
if (inventory.status !== 0) process.exit(inventory.status ?? 1)
const signing = spawnSync(process.execPath, [join(root, 'crates/tauri-runtime-electron/tools/macos-sign/sign.mjs')], { stdio: 'inherit' })
if (signing.error) throw signing.error
process.exit(signing.status ?? 1)
