/*
 * @title index
 * @swagger 2.0
 * @version 0.0.0
 */

import type { FetchOptions } from 'dsh-tauri/client'
import type * as Types from './index.type'
import { ofetch } from 'dsh-tauri/client'

/** @method get */
export function getSettings(options?: FetchOptions) {
  return ofetch<Types.GetApiTauriMivoSettingsResponse>('/api/tauri/mivo/settings', { method: 'get', ...options })
}

/** @method put */
export function putSettings(body: Types.PutApiTauriMivoSettingsBody, options?: FetchOptions) {
  return ofetch<Types.PutApiTauriMivoSettingsResponse>('/api/tauri/mivo/settings', { method: 'put', body, ...options })
}

/** @method get */
export function getModels(options?: FetchOptions) {
  return ofetch<Types.GetApiTauriMivoModelsResponse>('/api/tauri/mivo/models', { method: 'get', ...options })
}

/** @method post */
export function postAnalysis(body: Types.PostApiTauriMivoAnalysisBody, options?: FetchOptions) {
  return ofetch<Types.PostApiTauriMivoAnalysisResponse>('/api/tauri/mivo/analysis', { method: 'post', body, ...options })
}

/** @method post */
export function postCore(body: Types.PostApiTauriMivoCoreBody, options?: FetchOptions) {
  return ofetch<Types.PostApiTauriMivoCoreResponse>('/api/tauri/mivo/core', { method: 'post', body, ...options })
}

/** @method post */
export function postUpload(options?: FetchOptions) {
  return ofetch<Types.PostApiTauriMivoUploadResponse>('/api/tauri/mivo/upload', { method: 'post', ...options })
}
