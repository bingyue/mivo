export interface GetApiTauriMivoSettingsResponse { coreExecutable: string, vault: string }
export interface PutApiTauriMivoSettingsResponse { vault: string }
export type GetApiTauriMivoModelsResponse = { id: string, name: string, models: { id: string, name: string }[] }[]
export type PostApiTauriMivoAnalysisResponse = unknown
export type PostApiTauriMivoCoreResponse = unknown
export type PostApiTauriMivoUploadResponse = unknown

export interface PutApiTauriMivoSettingsBody {
  vault: string
}
export interface PostApiTauriMivoAnalysisBody {
  consent: false | true
  provider: string
  model: string
  sourceId?: undefined | string
  question?: undefined | string
  template?: undefined | string
  semantic?: undefined | false | true
}
export interface PostApiTauriMivoCoreBody {
  path: string
  method?: undefined | string
  data?: unknown
}
