// Cycle-day dialog label probe (BLOOM-0047 actual-cycle semantics).
// S1: tap inside a COMPLETED 26-day cycle → "Day X of 26" (real length),
//     NOT the recency average 29.
// S2: current cycle running 31 days past last start, no bleed logged (late)
//     → real day count continues, total omitted (no fake wrap to day 1).
const { chromium } = require('playwright')

const BASE = process.env.BASE || 'http://127.0.0.1:5196'

const isoAdd = (iso, days) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const localISO = (date = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

const fail = (m) => { console.error('ASSERT FAIL:', m); process.exitCode = 1 }
const ok = (m) => console.log('ok -', m)

;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] })
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } })
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  const today = localISO()
  // S1 data: A(today-56, 2d) -> B(today-30, 2d, interval 26) -> C(today, interval 30).
  // Recency-weighted avg = (26 + 2*30)/3 = 28.67 -> 29 (would be the OLD total).
  const A = isoAdd(today, -56)
  const B = isoAdd(today, -30)
  const tapDayS1 = isoAdd(A, 18) // day 19 inside cycle A
  const seed1 = { version: 1, entries: [], settings: {}, updatedAt: today }
  for (const [start, len] of [[A, 2], [B, 2], [today, 1]]) {
    for (let i = 0; i < len; i++) seed1.entries.push({ date: isoAdd(start, i), flow: 'medium', symptoms: [] })
  }

  const dialogText = async () =>
    page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]')
      return dlg ? dlg.innerText : null
    })
  const headlineOf = (t) => (t ? t.split('\n').find((l) => /^Day \d+/.test(l)) || t.replace(/\n/g, ' | ') : null)
  const tap = async (iso) =>
    page.evaluate((d) => {
      const btn = document.querySelector(`[data-calendar-scroll] button[aria-label="${d}"]`)
      if (!btn) return false
      btn.click()
      return true
    }, iso)

  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle0' })
  await page.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), seed1)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForTimeout(700)

  // S1
  if (!(await tap(tapDayS1))) { fail('S1 day button not found ' + tapDayS1) } else {
    await page.waitForTimeout(250)
    const t1 = await dialogText()
    if (!t1) fail('S1 no dialog opened')
    else if (t1.includes('Day 19 of 26')) ok(`S1 completed 26-day cycle -> headline "${headlineOf(t1)}"`)
    else if (t1.includes('Day 19 of 29') || t1.includes('of 28')) fail(`S1 still shows average total: ${t1.replace(/\n/g, ' | ')}`)
    else fail('S1 unexpected dialog: ' + t1.replace(/\n/g, ' | '))
  }
  // close
  await page.evaluate(() => document.querySelector('button[aria-label="Close"]')?.click())
  await page.waitForTimeout(150)

  // S2: single period start 31 days ago (2-day run), nothing since -> late.
  const start2 = isoAdd(today, -31)
  const seed2 = {
    version: 1,
    entries: [0, 1].map((i) => ({ date: isoAdd(start2, i), flow: 'light', symptoms: [] })),
    settings: { cycleLength: 28, periodLength: 2 },
    updatedAt: today,
  }
  await page.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), seed2)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForTimeout(700)

  if (!(await tap(today))) { fail('S2 today button not found ' + today) } else {
    await page.waitForTimeout(250)
    const t2 = await dialogText()
    if (!t2) fail('S2 no dialog opened')
    else if (/Day 32\b/.test(t2) && !/of \d+/.test(t2)) ok(`S2 late cycle keeps counting, no fake total -> headline "${headlineOf(t2)}"`)
    else fail('S2 late-cycle dialog wrong: ' + t2.replace(/\n/g, ' | '))
  }

  if (errors.length) console.log('pageerrors:', errors.join('; '))
  await browser.close()
  if (!process.exitCode) console.log('PROBE PASS')
})().catch((e) => { console.error('PROBE CRASH', e); process.exit(1) })
