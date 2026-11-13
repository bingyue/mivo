import { spawn } from 'node:child_process'
import { mkdirSync, createWriteStream, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
const root=resolve(import.meta.dirname,'../..'), scratch=resolve(root,process.env.MIVO_ACCEPTANCE_DIR || `.mivo-local/native-${Date.now()}`)
mkdirSync(scratch,{recursive:true})
const output=createWriteStream(resolve(scratch,'process.log'),{flags:'a'})
const executable=resolve(root,process.env.MIVO_DESKTOP_EXECUTABLE || 'apps/desktop/src-tauri/target/release/bundle/macos/Mivo.app/Contents/MacOS/deepseek-harness-desktop')
const child=spawn(executable,[],{cwd:root,env:{...process.env,DSH_E2E_HOME:scratch,MIVO_DSH_HOME:resolve(scratch,'dsh-home'),DSH_HOME:resolve(scratch,'forbidden-dsh-home'),DSH_DOWNLOAD_CACHE_DIR:resolve(scratch,'app-data'),MIVO_CONFIG_PATH:resolve(scratch,'mivo.json'),TAURI_WEBDRIVER_PORT:'4445',TAURI_RUNTIME_ELECTRON_OWNER:'mivo-final-acceptance',TAURI_RUNTIME_ELECTRON_ARGS:'--remote-debugging-address=127.0.0.1 --remote-debugging-port=9337'},stdio:['ignore','pipe','pipe']})
child.stdout.pipe(output);child.stderr.pipe(output)
let browser,page
const pause=ms=>new Promise(r=>setTimeout(r,ms))
try {
 for(let n=0;n<120;n++) { if(child.exitCode!==null) throw new Error('Native exited '+child.exitCode);try{browser=await chromium.connectOverCDP('http://127.0.0.1:9337');break}catch{await pause(500)} }
 if(!browser)throw new Error('No CDP')
 for(let n=0;n<100;n++) {
  page=browser.contexts().flatMap(context=>context.pages())[0]
  if(page)break
  await pause(100)
 }
 if(!page)throw new Error('Native window did not appear')
 page.on('pageerror',error=>console.error('PAGE_ERROR',error.message.slice(0,500)))
 for(let n=0;n<120;n++) {
  const skip=page.getByTestId('dsh-setup-preinstall-skip')
  if(await skip.isVisible().catch(()=>false)){await skip.click();console.log('Skipped optional plugins')}
  const welcome=page.getByRole('button',{name:'打开 / 创建 Vault',exact:true})
  if(await welcome.isVisible().catch(()=>false)) break
  const active=page.getByRole('button',{name:'收件箱',exact:true})
  if(await active.isVisible().catch(()=>false))break
  if(n%10===0){await page.screenshot({path:resolve(scratch,'startup.png')});console.log('Waiting native startup',n)}
  await pause(1000)
 }
 console.log((await page.locator('body').ariaSnapshot()).slice(0,5000))
 if(await page.getByRole('button',{name:'打开 / 创建 Vault',exact:true}).isVisible()){
  await page.getByLabel('Vault 绝对路径').fill(resolve(scratch,'vault'))
  await page.getByRole('button',{name:'打开 / 创建 Vault',exact:true}).click()
 }
 if(process.env.MIVO_ACCEPTANCE_RESTART === '1') {
  await page.getByRole('button',{name:'录音库',exact:true}).click()
  await page.getByRole('button',{name:'jfk.mp3',exact:true}).waitFor({timeout:30000})
  await page.getByRole('button',{name:'jfk.mp3',exact:true}).click()
  await page.getByLabel('时间片段 1',{exact:true}).waitFor({timeout:30000})
  const transcript=await page.getByLabel('时间片段 1',{exact:true}).inputValue()
  if(!transcript.includes('ask not'))throw new Error('Restart lost transcript')
  if(existsSync(resolve(scratch,'forbidden-dsh-home')))throw new Error('Mivo used another DSH environment')
  if(process.env.MIVO_ACCEPTANCE_TEST_SWITCH === '1') {
   const configPath=resolve(scratch,'mivo.json')
   const originalVault=JSON.parse(readFileSync(configPath,'utf8')).vault
   writeFileSync(resolve(scratch,'not-a-directory'),'test file')
   await page.getByRole('button',{name:'Vault 与 MCP',exact:true}).click()
   await page.getByLabel('切换到其他 Vault').fill(resolve(scratch,'not-a-directory/vault'))
   await page.getByRole('button',{name:'打开 / 创建 Vault',exact:true}).click()
   await page.getByRole('alert').waitFor({timeout:30000})
   if(JSON.parse(readFileSync(configPath,'utf8')).vault!==originalVault)throw new Error('Failed Vault switch changed active config')
   await page.getByRole('button',{name:'录音库',exact:true}).click()
   await page.getByRole('button',{name:'jfk.mp3',exact:true}).click()
   await page.getByLabel('时间片段 1',{exact:true}).waitFor({timeout:30000})
   console.log('INVALID_VAULT_SWITCH_RECOVERY_PASSED')
  }
  await page.screenshot({path:resolve(scratch,'installed-restart.png')})
  writeFileSync(resolve(root,'mivo/docs/installed-restart-acceptance.json'),JSON.stringify({status:'passed',executable,transcript,restarted_existing_vault:true,isolated_dsh_environment:true},null,2))
  console.log('INSTALLED_RESTART_ACCEPTANCE_PASSED')
 } else {
 await page.getByRole('button',{name:'收件箱',exact:true}).waitFor({timeout:30000})
 await page.getByRole('button',{name:'收件箱',exact:true}).click()
 await page.getByPlaceholder('资料标题').fill('原生安装包验收笔记')
 await page.getByPlaceholder('粘贴文字或输入笔记').fill('本次验收使用真实本地文件和真实 CPU 转写。未经确认的分析不应成为长期记忆。')
 await page.getByRole('button',{name:'保存到本地',exact:true}).click()
 await page.getByRole('button',{name:'原生安装包验收笔记',exact:true}).waitFor({timeout:20000})
 await page.locator('input[type=file]').setInputFiles(resolve(root,process.env.MIVO_ACCEPTANCE_AUDIO || '.mivo-local/fixtures/jfk.mp3'))
 await page.getByRole('button',{name:'jfk.mp3',exact:true}).waitFor({timeout:15000})
 await page.getByRole('button',{name:'jfk.mp3',exact:true}).click()
 if(process.env.MIVO_ACCEPTANCE_DOWNLOAD === '1') {
  await page.getByRole('button',{name:'下载 Whisper tiny · 78.2 MB · MIT（仅下载模型，不上传资料）',exact:true}).click()
  await page.getByRole('button',{name:'下载 Whisper tiny · 78.2 MB · MIT（仅下载模型，不上传资料）',exact:true}).waitFor({state:'hidden',timeout:180000})
 } else {
  await page.getByLabel('已下载 ASR 模型的本地目录').fill(resolve(root,process.env.MIVO_ACCEPTANCE_MODEL || '.mivo-local/download-vault/models/whisper-tiny'))
 }
 await page.getByRole('button',{name:'本地转写',exact:true}).click()
 await page.getByLabel('时间片段 1',{exact:true}).waitFor({timeout:90000})
 const transcript=await page.getByLabel('时间片段 1',{exact:true}).inputValue()
 if(!transcript.toLowerCase().includes('ask not')) throw new Error('Unexpected ASR result: '+transcript)
 if(!await page.getByRole('button',{name:'生成分析草稿',exact:true}).isDisabled())throw new Error('Missing cloud consent gate')
 const playback=await page.locator('audio').evaluate(async audio=>{await audio.play();await new Promise(r=>setTimeout(r,500));audio.pause();return{duration:audio.duration,position:audio.currentTime,error:audio.error?.message}})
 if(!playback.position||playback.error)throw new Error('Audio playback failed '+JSON.stringify(playback))
 await page.screenshot({path:resolve(scratch,'transcript.png')})
 await page.getByLabel('时间片段 1',{exact:true}).fill(transcript.trim())
 await page.getByRole('button',{name:'保存逐字稿校正',exact:true}).click()
 await page.waitForFunction(()=>{const visit=n=>[...n.querySelectorAll('button')].some(b=>b.textContent==='保存逐字稿校正'&&b.disabled)||[...n.querySelectorAll('*')].some(el=>el.shadowRoot&&visit(el.shadowRoot));return visit(document)})
 await page.getByRole('button',{name:'Vault 与 MCP',exact:true}).click()
 await page.getByRole('button',{name:'完整备份',exact:true}).click()
 await page.getByRole('status').filter({hasText:'.zip'}).waitFor({timeout:15000})
 const backup=await page.getByRole('status').filter({hasText:'.zip'}).innerText()
 if(!existsSync(backup.trim()))throw new Error('Backup not written: '+backup)
 const mcp=JSON.parse(await page.locator('pre').innerText())
 if(!existsSync(mcp.mcpServers.mivo.command))throw new Error('Packaged MCP executable missing')
 if(!await page.getByRole('button',{name:'建立 / 更新向量索引',exact:true}).isDisabled())throw new Error('Missing embedding consent gate')
 await page.screenshot({path:resolve(scratch,'settings.png')})
 writeFileSync(resolve(root,'mivo/docs/native-ui-acceptance.json'),JSON.stringify({status:'passed',platform:process.platform,transcript,playback,backup,mcp,cloud_tested:false},null,2))
 if(existsSync(resolve(scratch,'forbidden-dsh-home')))throw new Error('Mivo used another DSH environment')
 console.log('NATIVE_UI_ACCEPTANCE_PASSED')
 }
}catch(error){if(page){console.log((await page.locator('body').ariaSnapshot().catch(()=>'' )).slice(0,7000));await page.screenshot({path:resolve(scratch,'failure.png')}).catch(()=>{})}throw error}
finally {
 if(page)await page.evaluate(()=>{if(window.__TAURI_INTERNALS__?.invoke)void window.__TAURI_INTERNALS__.invoke('quit_app').catch(()=>{})}).catch(()=>{})
 for(let n=0;n<100&&child.exitCode===null;n++)await pause(100)
 await browser?.close().catch(()=>{})
 if(child.exitCode===null)child.kill('SIGTERM')
}
