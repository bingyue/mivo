import type { ClientContext } from 'dsh-tauri/client'
import { locale } from './locales'
import { recording } from './register/recording'
import { workbench } from './register/workbench'

export const name = 'mivo-workbench'
export const inject = ['slots', 'layout', 'locale']
export function apply(ctx: ClientContext) {
  ctx.effect(locale.registerLocale, 'mivo: locale')
  ctx.effect(workbench, 'mivo: workbench')
  ctx.effect(recording, 'mivo: recording')
}
