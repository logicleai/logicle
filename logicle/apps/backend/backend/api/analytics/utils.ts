export type AnalyticsPeriod = 'last_week' | 'last_month' | 'last_year' | 'custom'

export type BucketGranularity = 'hour' | 'day' | 'week' | 'month'

export type AnalyticsRange = {
  start: Date
  end: Date
  granularity: BucketGranularity
  period: AnalyticsPeriod
}

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDateParam(value: string | null) {
  if (!value) return null
  if (DATE_ONLY_RE.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return { date: new Date(year, month - 1, day), isDateOnly: true }
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return { date: parsed, isDateOnly: false }
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number) {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

function addHours(d: Date, hours: number) {
  const next = new Date(d)
  next.setHours(next.getHours() + hours)
  return next
}

function addMonths(d: Date, months: number) {
  const next = new Date(d)
  next.setMonth(next.getMonth() + months)
  return next
}

function chooseGranularity(start: Date, end: Date): BucketGranularity {
  const rangeMs = end.getTime() - start.getTime()
  if (rangeMs <= 2 * MS_PER_DAY) return 'hour'
  if (rangeMs <= 62 * MS_PER_DAY) return 'day'
  if (rangeMs <= 180 * MS_PER_DAY) return 'week'
  return 'month'
}

export function getAnalyticsRange(req: Request): AnalyticsRange | null {
  const url = new URL(req.url)
  const periodParam = url.searchParams.get('period')
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  const now = new Date()
  const defaultEnd = startOfDay(addDays(now, 1))

  const period: AnalyticsPeriod =
    periodParam === 'last_week' ||
    periodParam === 'last_month' ||
    periodParam === 'last_year' ||
    periodParam === 'custom'
      ? periodParam
      : fromParam || toParam
        ? 'custom'
        : 'last_month'

  if (period === 'custom') {
    const fromParsed = parseDateParam(fromParam)
    const toParsed = parseDateParam(toParam)
    if (!fromParsed || !toParsed) return null

    const start = fromParsed.isDateOnly ? startOfDay(fromParsed.date) : fromParsed.date
    let end = toParsed.date
    if (toParsed.isDateOnly) {
      end = startOfDay(addDays(toParsed.date, 1))
    }
    if (end <= start) return null
    return {
      start,
      end,
      granularity: chooseGranularity(start, end),
      period,
    }
  }

  if (period === 'last_week') {
    const end = defaultEnd
    const start = addDays(end, -7)
    return {
      start,
      end,
      granularity: chooseGranularity(start, end),
      period,
    }
  }

  if (period === 'last_year') {
    const end = defaultEnd
    const start = new Date(end)
    start.setFullYear(start.getFullYear() - 1)
    return {
      start,
      end,
      granularity: chooseGranularity(start, end),
      period,
    }
  }

  const end = defaultEnd
  const start = new Date(end)
  start.setMonth(start.getMonth() - 1)
  return {
    start,
    end,
    granularity: chooseGranularity(start, end),
    period: 'last_month',
  }
}

export function buildBuckets(range: AnalyticsRange) {
  const buckets: { start: Date; end: Date; startMs: number; endMs: number }[] = []
  let cursor = new Date(range.start)
  while (cursor < range.end) {
    let next: Date
    switch (range.granularity) {
      case 'hour':
        next = addHours(cursor, 1)
        break
      case 'day':
        next = addDays(cursor, 1)
        break
      case 'week':
        next = addDays(cursor, 7)
        break
      case 'month':
        next = addMonths(cursor, 1)
        break
    }
    if (next > range.end) next = range.end
    buckets.push({
      start: cursor,
      end: next,
      startMs: cursor.getTime(),
      endMs: next.getTime(),
    })
    cursor = next
  }
  return buckets
}

export function formatDateTime(d: Date) {
  const year = d.getFullYear()
  let month = `${d.getMonth() + 1}`
  let day = `${d.getDate()}`
  let hours = `${d.getHours()}`
  let minutes = `${d.getMinutes()}`
  let seconds = `${d.getSeconds()}`

  if (month.length < 2) month = `0${month}`
  if (day.length < 2) day = `0${day}`
  if (hours.length < 2) hours = `0${hours}`
  if (minutes.length < 2) minutes = `0${minutes}`
  if (seconds.length < 2) seconds = `0${seconds}`

  return `${[year, month, day].join('-')} ${[hours, minutes, seconds].join(':')}`
}

export function parseUserIdsParam(value: string | null) {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
