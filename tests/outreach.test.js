import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from '../lib/outreach/csv.js'
import { parseApps, parsePipeline, letterRowsToArrays } from '../lib/outreach/sheets.js'
import { ruleVerdict } from '../lib/outreach/rules.js'

test('parseCsv handles quotes, commas and newlines', () => {
  assert.deepEqual(parseCsv('a,b\n"x, ""y""","line1\nline2"\n'), [['a', 'b'], ['x, "y"', 'line1\nline2']])
})

const appRow = (over = {}) => {
  const r = Array(91).fill('')
  Object.assign(r, { 0: 'row1', 8: 'Slite', 10: 'slite', 11: '["Documents"]', 14: 'Team notes', 15: 'slite.com', 18: '["docs"]', 23: '[]', 24: '[]', 26: '10', 27: '0', 29: 'support@slite.com', 30: 'mail_sent', 31: 'introduction' }, over)
  return r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')
}
const header = ['rowid', ...Array(7).fill(''), 'appname', '', '', 'category', '', '', '', 'domain', ...Array(75).fill('')].join(',')

test('parseApps reads the positional export', () => {
  const [a] = parseApps(`${header}\n${appRow()}\n`)
  assert.equal(a.name, 'Slite')
  assert.equal(a.domain, 'slite.com')
  assert.equal(a.category, 'Documents')
  assert.equal(a.actionCount, 10)
  assert.equal(a.email, 'support@slite.com')
})

test('parsePipeline maps named columns', () => {
  const [p] = parsePipeline('partner,Source / Team,Reachout Reason,Stage,Status,Last Activity ,Next Follow Up ,Notes,co-marketing,embed pitched,,month\nSlite,Devesh,listing,Introductory,Lost/Rejected,1 Sep,,no,,FALSE,https://x.io,Sep\n')
  assert.equal(p.partner, 'Slite')
  assert.equal(p.status, 'lost/rejected')
  assert.equal(p.link, 'https://x.io')
})

test('rules settle clear no-outreach cases', () => {
  const app = { id: 'a', name: 'Slite', domain: 'slite.com', slug: 'slite', stages: '' }
  const seen = new Map([['slite.com', 'a']])
  assert.equal(ruleVerdict(app, [], seen), null)
  assert.equal(ruleVerdict(app, [{ partner: 'slite', status: 'lost/rejected' }], seen), 'rejected_before')
  assert.equal(ruleVerdict(app, [{ partner: 'Slite', status: 'in conversation' }], seen), 'in_pipeline')
  assert.equal(ruleVerdict({ ...app, domain: 'google.com' }, [], seen), 'enterprise')
  assert.equal(ruleVerdict({ ...app, id: 'b' }, [], seen), 'duplicate')
})

test('letterRowsToArrays turns Sheets letter keys into positional rows', () => {
  assert.deepEqual(letterRowsToArrays([{ _rowNumber: 1, A: 'x', C: 'z', AA: 'aa' }])[0].slice(0, 3), ['x', '', 'z'])
  assert.equal(letterRowsToArrays([{ AA: 'aa' }])[0][26], 'aa')
})
