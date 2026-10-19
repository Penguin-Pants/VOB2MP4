import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProject } from './project'

const valid = { version: 1, source: { kind: 'files' }, splitPoints: [], options: {}, naming: {} }

test('a saved project parses', () => {
  assert.deepEqual(parseProject(JSON.stringify(valid)), valid)
})

for (const [what, text] of [
  ['text that is not JSON', '{not json'],
  ['JSON null', 'null'],
  ['a JSON number', '5'],
  ['another version', '{"version":9,"source":{}}'],
  ['no source', '{"version":1}']
]) {
  test(`${what} is not a project`, () => {
    assert.equal(parseProject(text), null)
  })
}
