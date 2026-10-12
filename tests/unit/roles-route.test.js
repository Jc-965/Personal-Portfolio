import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import test from 'node:test'

test('every role has a journey page, a story, and a portfolio entry, and no id is also a chapter', async () => {
  const { JOURNEYS, ROLE_JOURNEYS } = await import('../../src/components/teardown/route.ts')
  const { ROLE_STORIES } = await import('../../src/content/roles/index.ts')
  const portfolio = JSON.parse(readFileSync(new URL('../../src/content/portfolio.json', import.meta.url), 'utf8'))
  const experiences = portfolio.experiences.map((experience) => experience.id)
  assert.deepEqual([...ROLE_JOURNEYS].sort(), Object.keys(ROLE_STORIES).sort())
  assert.deepEqual([...ROLE_JOURNEYS].sort(), [...experiences].sort())
  for (const id of ROLE_JOURNEYS) assert.ok(!JOURNEYS.includes(id), `${id} is both a role and a chapter`)
})

test('every role story has the three acts the islands pose for, and unique panel labels', async () => {
  const { ROLE_STORIES } = await import('../../src/content/roles/index.ts')
  for (const story of Object.values(ROLE_STORIES)) {
    assert.deepEqual(story.acts.map((act) => act.key), ['arrival', 'work', 'impact'], story.id)
    assert.equal(story.restLocal.length, story.acts.length, story.id)
    assert.equal(new Set(story.panels).size, story.panels.length, `${story.id} repeats a panel label`)
  }
})
