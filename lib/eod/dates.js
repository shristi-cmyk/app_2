// Dates are plain 'YYYY-MM-DD' strings in the team's timezone, the same text that goes in the sheet.

export function todayIn(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))

const dayOf = (date) => new Date(date + 'T12:00:00Z').getUTCDay()

export const isWorkingDay = (date, workingDays) => workingDays.includes(dayOf(date))

export function addDays(date, n) {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function eachDay(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < 1000; d = addDays(d, 1)) out.push(d)
  return out
}

export const workingDaysBetween = (from, to, workingDays) => eachDay(from, to).filter((d) => isWorkingDay(d, workingDays))

export function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}
