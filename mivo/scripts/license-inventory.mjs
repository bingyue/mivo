import { mkdirSync, readdirSync, readFileSync, copyFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const resources = join(root, 'apps/desktop/src-tauri/resources')
const out = join(resources, 'mivo/licenses')
const packages = new Map()
function inspect(directory) {
  const manifest = join(directory, 'package.json')
  if (!existsSync(manifest)) return
  const data = JSON.parse(readFileSync(manifest, 'utf8'))
  const key = `${data.name}@${data.version}`
  if (!packages.has(key)) {
    const licenseFiles = []
    const destination = join(out, 'javascript', key.replaceAll('/', '_'))
    mkdirSync(destination, { recursive: true })
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && /^(license|copying|notice)/i.test(entry.name)) {
        copyFileSync(join(directory, entry.name), join(destination, entry.name))
        licenseFiles.push(entry.name)
      }
    }
    packages.set(key, { name: data.name, version: data.version, license: data.license || data.licenses || 'SEE PACKAGE SOURCE', repository: data.repository, licenseFiles })
  }
  scan(join(directory, 'node_modules'))
}
const visited = new Set()
function scan(directory) {
  if (!existsSync(directory)) return
  const real = realpathSync(directory)
  if (visited.has(real)) return
  visited.add(real)
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.name.startsWith('@')) scan(path)
    else if (entry.isDirectory() || entry.isSymbolicLink()) inspect(path)
  }
}
scan(join(resources, 'node_modules'))
const archive = readdirSync(join(resources, 'dsh')).find(name => name.endsWith('.asar'))
if (!archive) throw new Error('DSH archive missing')
const inside = join(resources, 'dsh', archive, 'node_modules')
if (!existsSync(inside)) throw new Error('Run this inventory with bundled Electron in ELECTRON_RUN_AS_NODE mode to read ASAR licenses')
scan(inside)
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'javascript-runtime.json'), JSON.stringify([...packages.values()].sort((a, b) => a.name.localeCompare(b.name)), null, 2) + '\n')
console.log(`Copied notices for ${packages.size} deployed JavaScript packages, including ${basename(archive)}`)
