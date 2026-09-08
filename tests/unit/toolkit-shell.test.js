import assert from 'node:assert/strict'
import test from 'node:test'
import { runCommand } from '../../src/components/toolkitShell.ts'

const groups = [
  { id: 'languages', items: ['Python', 'TypeScript'] },
  { id: 'platforms', items: ['Docker', 'AWS'] },
]
const profile = { name: 'Jesse Chen', role: 'Software engineer' }

test('tree and ls print the skills tree and directories', () => {
  const tree = runCommand('tree', groups, profile)
  assert.equal(tree[1].kind, 'tree')
  const ls = runCommand('ls', groups, profile)
  assert.equal(ls[0].text, 'languages/  platforms/')
  assert.deepEqual(runCommand('ls platforms/', groups, profile)[0], { kind: 'items', dir: 'platforms', items: ['Docker', 'AWS'] })
})

test('grep finds tools across directories and unknown commands fail like zsh', () => {
  assert.deepEqual(runCommand('grep py', groups, profile).map(l => l.text), ['languages/Python'])
  assert.deepEqual(runCommand('grep script', groups, profile).map(l => l.text), ['languages/TypeScript'])
  assert.equal(runCommand('nope', groups, profile)[0].text, 'zsh: command not found: nope')
  assert.equal(runCommand('ls nowhere', groups, profile)[0].tone, 'error')
  assert.equal(runCommand('clear', groups, profile), 'clear')
  assert.deepEqual(runCommand('   ', groups, profile), [])
})
