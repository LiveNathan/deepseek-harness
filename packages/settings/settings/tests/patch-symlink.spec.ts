/** A symlinked profile patch keeps its link when the configuration editor writes. */
import { lstatSync, readFileSync, renameSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { configurationFixture as fixture } from './configuration-fixture.ts'

it('writes through a symlinked profile patch instead of replacing the symlink', async () => {
  const { ctx, profile, home } = await fixture()
  const target = join(home, 'source-of-truth.patch.yml')
  renameSync(profile.patchPath, target)
  symlinkSync(target, profile.patchPath)
  await ctx.settings.update('default-model', { model: 'symlinked' })
  expect(lstatSync(profile.patchPath).isSymbolicLink()).toBe(true)
  expect(parse(readFileSync(target, 'utf8'))).toContainEqual({ id: 'default-model', name: 'cordis:model', config: { provider: 'test', model: 'symlinked' } })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'symlinked' })
})
