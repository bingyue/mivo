import { spawnSync } from 'node:child_process'

const args = ['--filter', 'dsh-desktop', 'tauri', 'build', '--bundles', process.platform === 'darwin' ? 'app,dmg' : process.platform === 'win32' ? 'nsis' : 'deb']
if (process.platform === 'darwin') args.push('--config', 'src-tauri/tauri.macos-bundle.conf.json')
const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
  stdio: 'inherit', shell: process.platform === 'win32',
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
