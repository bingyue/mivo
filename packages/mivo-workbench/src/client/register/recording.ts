import type { ClientContext } from 'dsh-tauri/client'
import { defineRegister } from 'dsh-tauri/client'
import { uploadFiles } from '../apis/transport'
import { loadWorkspace } from '../service/workspace'
import { workspace } from '../store/modules/workspace'

export const recording = defineRegister<ClientContext>((controller) => {
  let recorder: MediaRecorder | undefined
  let stream: MediaStream | undefined
  let opening = false
  controller.add(workspace.$subscribeKey('recordCommand', () => {
    void toggle()
  }))
  controller.add(() => {
    if (recorder?.state === 'recording')
      recorder.stop()
    stream?.getTracks().forEach(track => track.stop())
  })
  async function toggle() {
    if (opening)
      return
    if (recorder?.state === 'recording') {
      recorder.stop()
      return
    }
    opening = true
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (controller.isDisposed()) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      const type = ['audio/webm;codecs=opus', 'audio/mp4'].find(value => MediaRecorder.isTypeSupported(value))
      recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      const parts: Blob[] = []
      let size = 0
      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          parts.push(event.data)
          size += event.data.size
        }
        if (size > 512 * 1024 * 1024 && recorder?.state === 'recording')
          recorder.stop()
      }
      recorder.onstop = () => {
        stream?.getTracks().forEach(track => track.stop())
        workspace.patch({ recording: false })
        const mime = recorder?.mimeType || 'audio/webm'
        const extension = mime.includes('mp4') ? 'm4a' : 'webm'
        if (parts.length) {
          void uploadFiles([new File(parts, `录音-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`, { type: mime })])
            .then(loadWorkspace)
            .catch(error => workspace.patch({ error: String(error) }))
        }
      }
      recorder.onerror = () => {
        workspace.patch({ error: 'MICROPHONE_RECORDING_FAILED' })
        stream?.getTracks().forEach(track => track.stop())
      }
      recorder.start(1000)
      workspace.patch({ recording: true, error: '' })
    }
    catch (error) {
      workspace.patch({ error: String(error), recording: false })
    }
    finally {
      opening = false
    }
  }
})
