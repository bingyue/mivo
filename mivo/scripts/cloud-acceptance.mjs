import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '../..')
const run = process.argv.includes('--run')
const scratch = resolve(root, process.env.MIVO_CLOUD_ACCEPTANCE_DIR || `.mivo-local/cloud-${Date.now()}`)
const vault = resolve(scratch, 'vault')
const dshHome = resolve(process.env.MIVO_ACCEPTANCE_DSH_HOME || resolve(homedir(), '.mivo-dsh'))
const executable = resolve(root, process.env.MIVO_DESKTOP_EXECUTABLE || 'apps/desktop/src-tauri/target/release/bundle/macos/Mivo.app/Contents/MacOS/deepseek-harness-desktop')
const provider = process.env.MIVO_ACCEPTANCE_PROVIDER
const model = process.env.MIVO_ACCEPTANCE_MODEL
const asrModel = process.env.MIVO_ACCEPTANCE_ASR_MODEL
const audioPaths = [process.env.MIVO_ACCEPTANCE_AUDIO_A, process.env.MIVO_ACCEPTANCE_AUDIO_B]
const report = { status: 'blocked', cloudCalled: false, checkedAt: new Date().toISOString(), missing: [], checks: [] }
mkdirSync(scratch, { recursive: true, mode: 0o700 })
const reportPath = resolve(scratch, 'report.json')
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function assert(condition, message) { if (!condition) throw new Error(message) }
function check(name) { report.checks.push(name); console.log(name); save() }
function hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex') }

if (!existsSync(dshHome)) report.missing.push('Configured Mivo DSH home')
if (!existsSync(executable)) report.missing.push('Built Mivo desktop executable')
if (!provider || !model) report.missing.push('MIVO_ACCEPTANCE_PROVIDER and MIVO_ACCEPTANCE_MODEL')
if (!asrModel || !existsSync(asrModel)) report.missing.push('MIVO_ACCEPTANCE_ASR_MODEL local directory')
if (audioPaths.some(path => !path || !existsSync(path))) report.missing.push('Two distinct real recordings: MIVO_ACCEPTANCE_AUDIO_A/B')
if (!['MIVO_EMBEDDING_URL', 'MIVO_EMBEDDING_MODEL', 'MIVO_EMBEDDING_API_KEY'].every(name => process.env[name]))
  report.missing.push('Commercial Embedding environment configuration')
save()
if (!existsSync(dshHome) || !existsSync(executable)) {
  console.log(JSON.stringify({ status: report.status, missing: report.missing, report: reportPath }))
  process.exitCode = 2
} else {
  let child, browser, page
  try {
    const log = createWriteStream(resolve(scratch, 'desktop.log'), { mode: 0o600 })
    child = spawn(executable, [], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: {
        ...process.env, DSH_E2E_HOME: scratch, MIVO_DSH_HOME: dshHome,
        DSH_HOME: resolve(scratch, 'unused-dsh-home'), DSH_DOWNLOAD_CACHE_DIR: resolve(scratch, 'app-data'),
        MIVO_CONFIG_PATH: resolve(scratch, 'mivo.json'), TAURI_WEBDRIVER_PORT: '4445',
        TAURI_RUNTIME_ELECTRON_OWNER: 'mivo-cloud-acceptance',
        TAURI_RUNTIME_ELECTRON_ARGS: '--remote-debugging-address=127.0.0.1 --remote-debugging-port=9338',
      },
    })
    child.stdout.pipe(log); child.stderr.pipe(log)
    for (let n = 0; n < 120; n++) {
      assert(child.exitCode === null, 'Desktop exited before connection')
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9338'); break } catch { await pause(500) }
    }
    assert(browser, 'Desktop debug connection unavailable')
    for (let n = 0; n < 100; n++) {
      page = browser.contexts().flatMap(context => context.pages())[0]
      if (page) break
      await pause(100)
    }
    assert(page, 'Desktop window unavailable')
    for (let n = 0; n < 120; n++) {
      const skip = page.getByTestId('dsh-setup-preinstall-skip')
      if (await skip.isVisible().catch(() => false)) await skip.click()
      if (await page.getByRole('button', { name: '打开 / 创建 Vault', exact: true }).isVisible().catch(() => false)) break
      await pause(1000)
    }
    async function request(path, data, method = data === undefined ? 'GET' : 'POST') {
      return page.evaluate(async ({ path, data, method }) => {
        const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) })
        return { status: response.status, body: await response.json() }
      }, { path, data, method })
    }
    async function api(path, data, method) {
      const response = await request(path, data, method)
      assert(response.status >= 200 && response.status < 300, `HTTP ${response.status} at ${path}`)
      return response.body
    }
    const core = (path, data) => api('/api/tauri/mivo/core', { path, method: data === undefined ? 'GET' : 'POST', data })
    const providers = await api('/api/tauri/mivo/models')
    report.providers = providers.map(item => ({ id: item.id, models: item.models.map(value => value.id) }))
    if (!providers.some(item => item.id === provider && item.models.some(value => value.id === model)))
      report.missing.push('Selected provider/model is not available in the actual DSH runtime')
    const refused = await request('/api/tauri/mivo/analysis', { consent: false, provider: provider || 'unconfigured', model: model || 'unconfigured', question: 'permission check' })
    assert(refused.status >= 400, 'Cloud call accepted without consent')
    check('Actual DSH model discovery and denied-consent request verified')
    if (!run || report.missing.length) {
      report.status = report.missing.length ? 'blocked' : 'ready-not-run'
      save()
      console.log(JSON.stringify({ status: report.status, missing: report.missing, report: reportPath }))
      if (report.missing.length) process.exitCode = 2
    } else {
      assert(audioPaths.every(path => statSync(path).isFile()), 'Audio input must be a file')
      assert(hash(audioPaths[0]) !== hash(audioPaths[1]), 'Recordings must differ')
      console.log('本测试会将两份验收录音的逐字稿和确认后的知识片段发送至所选云模型与 Embedding 服务；原始音频只在本机处理。')
      await api('/api/tauri/mivo/settings', { vault }, 'PUT')
      const sources = [], transcripts = [], drafts = []
      for (const [index, path] of audioPaths.entries()) {
        const encoded = readFileSync(path).toString('base64')
        const filename = `验收录音${index + 1}-${basename(path)}`
        const response = await page.evaluate(async ({ encoded, filename }) => {
          const data = new FormData()
          data.append('file', new Blob([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))]), filename)
          const response = await fetch('/api/tauri/mivo/upload', { method: 'POST', body: data })
          return { status: response.status, body: await response.json() }
        }, { encoded, filename })
        assert(response.status === 200, 'Real recording import failed')
        const source = response.body
        assert(source.sha256 === hash(path), 'Original recording checksum mismatch')
        sources.push(source)
        const job = await core(`/sources/${source.id}/transcribe`, { provider: 'whisper', model_path: resolve(asrModel), device: 'cpu' })
        let complete = false
        for (let n = 0; n < 600; n++) {
          const state = (await core('/jobs')).find(item => item.id === job.id)
          assert(state?.status !== 'failed', 'Real local ASR job failed')
          if (state?.status === 'completed') { complete = true; break }
          await pause(500)
        }
        assert(complete, 'Local ASR timed out')
        const transcript = await core(`/sources/${source.id}/transcript`)
        assert(transcript.text.trim() && transcript.segments.some(segment => segment.end > segment.start), 'Missing real transcript or timestamps')
        transcripts.push(transcript)
      }
      assert(transcripts[0].text.trim() !== transcripts[1].text.trim(), 'Use two different recordings, not encodings of the same speech')
      check('Two real recordings imported and transcribed locally')
      for (const [index, source] of sources.entries()) {
        for (const template of index === 0 ? ['meeting', 'critical', 'actions', 'knowledge'] : ['meeting']) {
          report.cloudCalled = true; save()
          const draft = await api('/api/tauri/mivo/analysis', { consent: true, provider, model, sourceId: source.id, template })
          assert(draft.payload?.summary?.trim() && draft.confirmed === 0, 'Missing actual AI draft or draft was auto-confirmed')
          assert(draft.execution?.successfulTools.includes('mivo_get_transcript'), 'No successful DSH transcript tool call recorded')
          assert(draft.payload.evidence.every(value => transcripts[index].segments[value]), 'AI evidence does not identify a real segment')
          drafts.push(draft)
          assert((await core('/memories')).length === 0, 'Unconfirmed analysis entered permanent memory')
          check(`Cloud analysis and real DSH tool call: source ${index + 1}, ${template}`)
        }
      }
      assert((await core('/search', { query: '验收录音', limit: 10 })).length === 0, 'Draft leaked into retrieval')
      for (const source of sources) {
        const draft = drafts.find(item => item.payload.source_id === source.id && item.payload.template === 'meeting')
        await core(`/analyses/${draft.id}/confirm`, { confirmed: true })
      }
      assert((await core('/memories')).length === 2, 'Confirmation did not persist exactly two memories')
      const lexical = await core('/search', { query: '验收录音', limit: 10 })
      assert(sources.every(source => lexical.some(hit => hit.source_id === source.id)), 'Local retrieval omitted a source')
      check('Human confirmation boundary and multisource local retrieval verified')
      const indexed = await core('/embeddings', { consent: true })
      assert(indexed.indexed > 0, 'Commercial embedding did not produce an index')
      const answer = await api('/api/tauri/mivo/analysis', { consent: true, provider, model, semantic: true,
        question: '请对比两份验收录音的主要内容，为每份录音引用 mivo://source/ID 和时间范围。' })
      const references = [...answer.answer.matchAll(/mivo:\/\/source\/([a-f0-9]{32})/g)].map(match => match[1])
      assert(sources.every(source => references.includes(source.id)), 'RAG answer did not cite both recordings')
      assert(references.every(id => sources.some(source => source.id === id)), 'RAG answer invented a source')
      assert(answer.sources.every(hit => Number.isFinite(hit.start) && Number.isFinite(hit.end)), 'RAG evidence lacks timestamps')
      check('Commercial embedding, hybrid retrieval and cited cross-recording answer verified')
      const settings = await api('/api/tauri/mivo/settings')
      const mcp = spawnSync('uv', ['run', '--project', resolve(root, 'mivo/core'), '--extra', 'whisper', 'python',
        resolve(root, 'mivo/scripts/mcp-acceptance.py'), '--binary', settings.coreExecutable, '--vault', vault,
        '--source', sources[0].id, '--source', sources[1].id], { cwd: root, encoding: 'utf8', timeout: 60000 })
      assert(mcp.status === 0, 'Real MCP acceptance failed; inspect local Vault and client output')
      for (const source of sources) assert(hash(resolve(vault, source.original)) === source.sha256, 'Original changed during AI processing')
      check('Actual MCP client retrieved both sources; originals remain unchanged')
      report.status = 'passed'
      report.provider = provider; report.model = model
      report.sources = sources.map(source => ({ id: source.id, sha256: source.sha256 }))
      report.analysisExecutions = drafts.map(draft => ({ template: draft.payload.template, ...draft.execution }))
      report.embeddingChunks = indexed.indexed
      report.answer = answer.answer
      save()
      console.log(JSON.stringify({ status: report.status, report: reportPath }))
    }
  } catch (error) {
    report.status = 'failed'; report.failure = error.message; save()
    console.error(error.message)
    process.exitCode = 1
  } finally {
    if (page) await page.evaluate(() => { if (window.__TAURI_INTERNALS__?.invoke) void window.__TAURI_INTERNALS__.invoke('quit_app').catch(() => {}) }).catch(() => {})
    if (child) for (let n = 0; n < 100 && child.exitCode === null; n++) await pause(100)
    await browser?.close().catch(() => {})
    if (child?.exitCode === null) child.kill('SIGTERM')
  }
}
