import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// Isolated data dir before any EOD module loads.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eod-test-'))
const { groundItems, computeFlags, normalizeFields, editedItems } = await import('../lib/eod/extract.js')
const { looksLikeRating, sanitizeBrief, consistency, asksForRating } = await import('../lib/eod/brief.js')
const { rowToEntry, cellToList, listToCell, rowFromRange } = await import('../lib/eod/sheet.js')
const { workingDaysBetween, monthRange, todayIn, isDate } = await import('../lib/eod/dates.js')
const { withLock } = await import('../lib/eod/db.js')
const { hashPassword, verifyPassword } = await import('../lib/eod/auth.js')

const RAW = 'today i fixed the login bug and reviewed 2 PRs. blocked on staging db access. tomorrow: write tests for checkout'

test('grounding keeps what the employee said and drops invented items', () => {
  const { kept, dropped } = groundItems({
    done: ['Fixed the login bug', 'Reviewed 2 PRs', 'Deployed the payments service to production'],
    blockers: ['Staging DB access'],
    plan: ['Write tests for checkout']
  }, RAW)
  assert.deepEqual(kept.done, ['Fixed the login bug', 'Reviewed 2 PRs'])
  assert.deepEqual(kept.blockers, ['Staging DB access'])
  assert.deepEqual(kept.plan, ['Write tests for checkout'])
  assert.equal(dropped.length, 1)
  assert.equal(dropped[0].item, 'Deployed the payments service to production')
})

test('flags: incomplete, contradictory, short, unverified', () => {
  const codes = (f, raw, d) => computeFlags(f, raw, { dropped: d }).map((x) => x.code)
  assert.deepEqual(codes({ done: ['a thing done here'], blockers: [], plan: ['next thing tomorrow'] }, RAW), [])
  assert.ok(codes({ done: [], blockers: [], plan: ['x'] }, RAW).includes('no_done'))
  assert.ok(codes({ done: ['x'], blockers: [], plan: [] }, RAW).includes('no_plan'))
  assert.ok(codes({ done: ['x'], blockers: ['waiting on review'], plan: ['y'] }, 'did x and y, no blockers today, waiting on review maybe').includes('blockers_contradiction'))
  assert.ok(codes({ done: ['Write checkout tests'], blockers: [], plan: ['write checkout tests'] }, RAW).includes('done_plan_overlap'))
  assert.ok(codes({ done: ['x'], blockers: [], plan: ['y'] }, 'did x').includes('very_short'))
  assert.ok(codes({ done: ['x'], blockers: [], plan: ['y'] }, RAW, [{ field: 'done', item: 'z' }]).includes('ai_unverified'))
})

test('confirmed fields are validated and cleaned', () => {
  assert.deepEqual(normalizeFields({ done: ['  • one ', ''], blockers: [], plan: ['- two'] }), { done: ['one'], blockers: [], plan: ['two'] })
  assert.throws(() => normalizeFields({ done: 'text' }), /must be a list/)
  assert.throws(() => normalizeFields({ done: [1] }), /must be text/)
  assert.throws(() => normalizeFields({ done: Array(21).fill('x') }), /Too many/)
  assert.deepEqual(editedItems({ done: ['a'], blockers: [], plan: [] }, { done: ['a', 'b'], blockers: [], plan: [] }), [{ field: 'done', item: 'b' }])
})

test('rating guard catches scores and evaluative verdicts, not ordinary work', () => {
  for (const bad of ['Overall rating: 4/5', 'I would score her 8 out of 10', 'She scored 7 this month', 'Her overall score is high', 'A top performer this month', 'Rated as meets expectations', 'underperforming on tickets', 'ranked first in the team']) {
    assert.ok(looksLikeRating(bad), bad)
  }
  for (const ok of ['Fixed the scoring service bug', 'Logged 18 of 21 working days', 'Recurring blocker: staging DB access', 'Reviewed 5 PRs']) {
    assert.ok(!looksLikeRating(ok), ok)
  }
  const out = sanitizeBrief({
    themes: [{ text: 'Frontend bug fixes', rows: ['0:2', '0:99'] }, { text: 'Strong performer, 9/10', rows: ['0:2'] }],
    blockers: [{ text: 'Staging DB access', rows: ['0:3'], unresolved: true }],
    gaps: [],
    answer: 'I would rate Asha 4 out of 5'
  }, new Set(['0:2', '0:3']))
  assert.equal(out.themes.length, 1)
  assert.deepEqual(out.themes[0].rows, ['0:2']) // a row that was not in the data is not cited
  assert.equal(out.removed, 2)
  assert.ok(!looksLikeRating(out.answer))
})

test('a TL question asking for a rating is recognised', () => {
  for (const q of ['Rate Ana from 1 to 10', 'What score should Ben get?', 'Rank the team', 'give her a 4 out of 5?']) assert.ok(asksForRating(q), q)
  for (const q of ['Which blockers keep coming back?', 'What did Ana work on in week 2?']) assert.ok(!asksForRating(q), q)
})

test('consistency counts distinct logged working days', () => {
  const members = [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }]
  const entries = [
    { memberId: 'm1', date: '2026-10-12' }, { memberId: 'm1', date: '2026-10-12' }, { memberId: 'm1', date: '2026-10-13' },
    { memberId: 'm1', date: '2026-10-18' } // Sunday: not a working day
  ]
  const [a, b] = consistency(entries, members, '2026-10-12', '2026-10-16', [1, 2, 3, 4, 5])
  assert.equal(a.days_logged, 2)
  assert.equal(a.working_days, 5)
  assert.deepEqual(a.missing_dates, ['2026-10-14', '2026-10-15', '2026-10-16'])
  assert.equal(b.days_logged, 0)
})

test('sheet rows map by configured headers, with empty cells and loose header matching', () => {
  const columns = { entryId: 'Entry ID', date: 'Date', employee: 'Employee', done: 'Done', blockers: 'Blockers', plan: 'Plan', submittedAt: 'Submitted At' }
  const e = rowToEntry({ _rowNumber: 7, 'entry id': 'eod_x', Date: '2026-10-19', Employee: 'Asha', Done: '• a\n• b', Plan: null, 'Submitted At': '' }, columns, '0')
  assert.equal(e.sheetRowId, '0:7')
  assert.equal(e.entryId, 'eod_x')
  assert.deepEqual(e.done, ['a', 'b'])
  assert.deepEqual(e.blockers, [])
  assert.deepEqual(e.plan, [])
  assert.deepEqual(cellToList(listToCell(['x', 'y'])), ['x', 'y'])
  assert.equal(rowFromRange('Sheet1!A12:G12'), 12)
  assert.equal(rowFromRange("'My Tab'!A3:G4"), 3)
  assert.equal(rowFromRange(undefined), null)
})

test('dates', () => {
  assert.equal(workingDaysBetween('2026-10-01', '2026-10-31', [1, 2, 3, 4, 5]).length, 22)
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' })
  assert.equal(todayIn('Asia/Kolkata', new Date('2026-10-19T20:00:00Z')), '2026-10-20')
  assert.ok(isDate('2026-10-19') && !isDate('2026-13-45') && !isDate('x'))
})

test('withLock runs one task per key at a time (no double writes from double clicks)', async () => {
  let running = 0, max = 0
  const task = () => withLock('k', async () => { running++; max = Math.max(max, running); await new Promise((r) => setTimeout(r, 10)); running-- })
  await Promise.all([task(), task(), task()])
  assert.equal(max, 1)
  await assert.rejects(withLock('k', async () => { throw new Error('boom') }), /boom/)
  assert.equal(await withLock('k', async () => 5), 5) // a failure does not block the next task
})

test('passwords are hashed and verified', () => {
  const h = hashPassword('correct horse')
  assert.ok(h.startsWith('scrypt$') && !h.includes('correct'))
  assert.ok(verifyPassword('correct horse', h))
  assert.ok(!verifyPassword('wrong', h))
})

test('the scheduled rollup covers the month that just ended', async () => {
  const { previousMonth } = await import('../lib/eod/service.js')
  assert.equal(previousMonth('2026-11-01'), '2026-10')
  assert.equal(previousMonth('2027-01-01'), '2026-12')
})
