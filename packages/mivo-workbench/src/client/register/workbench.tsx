import type { ClientContext } from 'dsh-tauri/client'
import { definePanel, defineRegister } from 'dsh-tauri/client'
import { Workbench } from '../components/workbench'
import { loadWorkspace } from '../service/workspace'

export const workbench = defineRegister<ClientContext>((controller, ctx) => {
  controller.add(ctx.slots.inject('sidebar.brand.mark' as never, () => ctx.slots.register(
    { name: 'sidebar.brand.mark', priority: -100, registrant: 'mivo' } as never,
    (() => <span style={{ color: '#16836b', fontWeight: 800, fontSize: 24 }}>M</span>) as never,
  )))
  controller.add(ctx.slots.inject('sidebar.brand.name' as never, () => ctx.slots.register(
    { name: 'sidebar.brand.name', priority: -100, registrant: 'mivo' } as never,
    (() => <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em' }}>Mivo</span>) as never,
  )))
  const previousTitle = document.title
  document.title = 'Mivo — Your Personal AI Memory'
  controller.add(() => {
    document.title = previousTitle
  })
  const panel = definePanel(ctx, { id: 'mivo', label: 'Mivo', order: -100, render: Workbench, icon: () => <span style={{ fontWeight: 800 }}>M</span> })
  controller.add(panel.dispose)
  panel.select()
  void loadWorkspace()
  controller.interval(() => {
    void loadWorkspace()
  }, 5000)
})
