import assert from 'node:assert/strict'
import test from 'node:test'
import { matchRoute, projectPath } from '../../src/router.ts'

test('matchRoute knows the three pages', () => {
  assert.deepEqual(matchRoute('/'), { page: 'home' })
  assert.deepEqual(matchRoute('/projects'), { page: 'projects' })
  assert.deepEqual(matchRoute('/projects/'), { page: 'projects' })
  assert.deepEqual(matchRoute('/projects/agoriai'), { page: 'project', id: 'agoriai' })
  assert.deepEqual(matchRoute('/projects/Agoriai/'), { page: 'project', id: 'agoriai' })
  assert.deepEqual(matchRoute('/projects/a/b'), { page: 'home' })
  assert.deepEqual(matchRoute('/anything'), { page: 'home' })
})

test('projectPath has a trailing slash so it matches the static shells', () => {
  assert.equal(projectPath('tarocchi'), '/projects/tarocchi/')
})
