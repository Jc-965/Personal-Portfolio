import assert from 'node:assert/strict'
import test from 'node:test'
import { validateProject, projects, coverOf } from '../../src/content/story.ts'

test('every project in portfolio.json passes validation', () => {
  for (const project of projects) assert.deepEqual(validateProject(project), [], project.id)
})

test('validation names what is missing', () => {
  const problems = validateProject({ id: 'x', name: 'X', tech: [], stats: [], story: { role: '', problem: { was: [], needed: ['a'] }, build: [], proof: [] } })
  assert.ok(problems.some(p => p.includes('blurb')))
  assert.ok(problems.some(p => p.includes('problem.was')))
  assert.ok(problems.some(p => p.includes('build')))
  assert.ok(problems.some(p => p.includes('role')))
})

test('the cover is the first image, or the terminal for code projects', () => {
  const parkiwell = projects.find(p => p.id === 'parkiwell')
  assert.equal(coverOf(parkiwell).portrait, true)
  assert.equal(coverOf(parkiwell).src, '/ParkiWell/welcome.webp')
  const mycommunity = projects.find(p => p.id === 'mycommunity')
  assert.equal(coverOf(mycommunity).src, undefined)
  assert.ok(coverOf(mycommunity).terminal.length > 0)
})
