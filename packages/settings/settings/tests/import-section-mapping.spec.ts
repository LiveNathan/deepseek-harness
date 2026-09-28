/** Legacy section names resolve to the entry id that owns their settings. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { configurationFixture as fixture } from './configuration-fixture.ts'

it('imports a legacy section into the entry that owns it', async () => {
  const { ctx, home, profile, start } = await fixture({ entries: [{ id: 'subagent-model-selection-settings', name: 'cordis:selection' }] })
  await ctx.fiber.dispose()
  writeFileSync(join(home, 'settings.yaml'), 'subagent-model-selection:\n  enabled: true\n')
  const restored = await start()
  await vi.waitFor(() => {
    expect(parse(readFileSync(profile.patchPath, 'utf8'))).toContainEqual({ id: 'subagent-model-selection-settings', name: 'cordis:selection', config: { enabled: true } })
  })
  expect(restored.settings.describe().find(row => row.ns === 'subagent-model-selection-settings')!.value).toEqual({ enabled: true })
})
