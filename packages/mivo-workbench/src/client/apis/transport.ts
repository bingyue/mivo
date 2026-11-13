import { postCore, postUpload } from './index'

export async function coreRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  return await postCore({ path, method, data }) as T
}
export async function uploadFiles(files: File[]) {
  for (const file of files) {
    const body = new FormData()
    body.append('file', file)
    await postUpload({ body })
  }
}
