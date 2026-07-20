import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'

const content = JSON.parse(
  await readFile(new URL('../../src/content/portfolio.json', import.meta.url), 'utf8'),
)

test('portfolio profile exposes verified recruiter contact paths', () => {
  assert.match(content.profile.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  assert.equal(content.profile.resumePath, '/Jesse_Chen_Resume.pdf')
  assert.match(content.profile.linkedin, /linkedin\.com\/in\/jessec2/)
})

test('every project has complete case-study content and a generated page', async () => {
  assert.equal(content.projects.length, 4)
  for (const project of content.projects) {
    assert.ok(project.lead.length > 40)
    assert.ok(project.caseStudy.challenge.length > 40)
    assert.ok(project.caseStudy.approach.length >= 3)
    assert.ok(project.caseStudy.outcomes.length >= 3)
    await access(new URL(`../../public/projects/${project.id}/index.html`, import.meta.url))
  }
})
