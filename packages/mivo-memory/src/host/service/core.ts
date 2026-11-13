import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { defineService } from 'dsh-tauri'
import { runtime } from '../config/runtime'

const configPath = process.env.MIVO_CONFIG_PATH || join(homedir(), '.mivo', 'desktop.json')
export const core = defineService({
  async settings() {
    try {
      const config = JSON.parse(await readFile(configPath, 'utf8')) as {
        vault: string
      }
      return { ...config, coreExecutable: core.resolveExecutable() }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { vault: '', coreExecutable: core.resolveExecutable() }
      throw error
    }
  },
  resolveExecutable() {
    const bundled = join(import.meta.dirname, '../../../mivo/core/mivo-core', process.platform === 'win32' ? 'mivo-core.exe' : 'mivo-core')
    return process.env.MIVO_CORE_EXECUTABLE || (existsSync(bundled) ? bundled : '')
  },
  async configure(vault: string) {
    if (!isAbsolute(vault) || vault.length > 4096)
      throw new Error('VAULT_PATH_MUST_BE_ABSOLUTE')
    const previous = await readFile(configPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT')
        return undefined
      throw error
    })
    await core.stop()
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 })
    await writeFile(configPath, JSON.stringify({ vault }), { mode: 0o600 })
    try {
      await core.start()
    }
    catch (error) {
      await core.stop()
      if (previous === undefined)
        await unlink(configPath)
      else
        await writeFile(configPath, previous, { mode: 0o600 })
      throw error
    }
    return { vault }
  },
  async start() {
    if (runtime.connection)
      return
    if (runtime.starting)
      return runtime.starting
    runtime.starting = (async () => {
      const { vault } = await core.settings()
      if (!vault)
        throw new Error('MIVO_SETUP_REQUIRED')
      const native = core.resolveExecutable()
      const executable = native || process.env.MIVO_PYTHON || 'python3'
      const args = native ? ['--vault', vault, '--watch-parent'] : ['-m', 'mivo_core', '--vault', vault, '--watch-parent']
      const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONPATH: process.env.MIVO_CORE_PATH || process.env.PYTHONPATH || '' } })
      runtime.child = child
      child.once('exit', () => {
        if (runtime.child === child) {
          runtime.connection = undefined
          runtime.child = undefined
        }
      })
      let errorTail = ''
      child.stderr?.on('data', (data: Buffer) => {
        errorTail = (errorTail + data.toString()).slice(-1000)
      })
      await new Promise<void>((resolve, reject) => {
        const reader = createInterface({ input: child.stdout! })
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error('MIVO_CORE_START_TIMEOUT'))
        }, 20000)
        function failed(error: Error) {
          clearTimeout(timer)
          reader.close()
          reject(error)
        }
        child.once('error', failed)
        child.once('exit', (code) => {
          if (!runtime.connection)
            failed(new Error(`MIVO_CORE_EXIT_${code}: ${errorTail}`))
        })
        reader.on('line', (line) => {
          try {
            const value = JSON.parse(line) as {
              mivo_core?: boolean
              url: string
              token: string
            }
            if (!value.mivo_core || !/^http:\/\/127\.0\.0\.1:\d+$/.test(value.url) || value.token.length < 32)
              return
            runtime.connection = value
            clearTimeout(timer)
            reader.close()
            resolve()
          }
          catch {
            failed(new Error('MIVO_CORE_INVALID_HANDSHAKE'))
          }
        })
      })
    })()
    try {
      await runtime.starting
    }
    finally {
      runtime.starting = undefined
    }
  },
  async stop() {
    const child = runtime.child
    runtime.connection = undefined
    if (child && child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 15000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        child.kill('SIGTERM')
      })
    }
    runtime.child = undefined
  },
  async request(path: string, init: RequestInit = {}) {
    await core.start()
    const connection = runtime.connection!
    return fetch(connection.url + path, { ...init, headers: {
      ...Object.fromEntries(new Headers(init.headers)),
      Authorization: `Bearer ${connection.token}`,
    }, signal: init.signal || AbortSignal.timeout(120000) })
  },
  async json(path: string, body?: unknown, signal?: AbortSignal) {
    const response = await core.request(path, { method: body === undefined ? 'GET' : 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.ok)
      throw new Error(`MIVO_CORE_${response.status}: ${await response.text()}`)
    return response.json()
  },
})
