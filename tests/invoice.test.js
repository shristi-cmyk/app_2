import test from 'node:test'
import assert from 'node:assert/strict'
import { fill, buildTags, buildHandler } from '../lib/invoice.js'

const row = { buyer_email: 'a@x.com', buyer_name: 'Ann', invoice_no: 'INV-1', amount: '50', date: '2026-10-10' }
const options = [{ label: 'buyer_name', value: 'bn@text' }, { label: 'invoice_no', key: 'invoice_no', type: 'string' }]

test('fill replaces placeholders', () => {
  assert.equal(fill('Hi {{buyer_name}} - {{invoice_no}}', row), 'Hi Ann - INV-1')
})

test('buildTags maps options by column name, verbatim keys', () => {
  assert.deepEqual(buildTags(options, row), { 'bn@text': 'Ann', invoice_no: 'INV-1' })
})

test('handler is valid JavaScript and bakes in no secret', () => {
  const code = buildHandler({ docsScriptId: 'scriD', gmailScriptId: 'scriG', config: { templateId: 't1', subject: 'S {{invoice_no}}', body: 'B\n{{amount}}', tagOptions: options } })
  new (Object.getPrototypeOf(async function () {}).constructor)('context', 'fetch', code)
  assert.ok(!code.includes('VIASOCKET_EMBED_SECRET'))
})
