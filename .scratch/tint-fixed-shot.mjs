// Phone-morphic screenshot of the FIXED build with bright-green month tint,
// plus DOM geometry evidence: green path bbox vs October anchor row top.
import { chromium } from 'playwright'

const port = process.argv[2] || '5198'
const BASE = `http://localhost:${port}/`
const out = process.argv[3] || '/tmp/tint-fixed.png'

const snap = {
  version: 1,
  entries: [
    { date: '2026-08-05', flow: 'medium', symptoms: [] },
    { date: '2026-08-06', flow: 'medium', symptoms: [] },
    { date: '2026-08-07', flow: 'light', symptoms: [] },
    { date: '2026-09-02', flow: 'medium', symptoms: [] },
    { date: '2026-09-03', flow: 'medium', symptoms: [] },
    { date: '2026-09-04', flow: 'light', symptoms: [] },
  ],
  settings: { cycleLength: 28, periodLength: 5, style: { monthTint: '#00ff00' } },
  updatedAt: new Date().toISOString(),
}

const b = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const p = await b.newPage({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
})
await p.goto(BASE)
await p.waitForTimeout(800)
await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
await p.reload()
await p.waitForTimeout(2500)

const geo = await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const scroll = document.querySelector('[data-calendar-scroll]')
  if (!svg || !scroll) return { error: 'missing elements' }
  const svgRect = svg.getBoundingClientRect()
  const rows = [...scroll.querySelectorAll('div[data-month]')].map((r) => {
    const rr = r.getBoundingClientRect()
    const [y, m] = (r.getAttribute('data-month') || '0-0').split('-').map(Number)
    let mo = m + 1, yr = y
    if (mo > 12) { mo = 1; yr += 1 }
    return { ym: `${yr}-${String(mo).padStart(2, '0')}`, top: rr.top - svgRect.top, h: rr.height }
  })
  const paths = [...svg.querySelectorAll('path')].map((q) => {
    const bb = q.getBBox()
    const st = q.getAttribute('style') || ''
    return { y: Math.round(bb.y * 10) / 10, y2: Math.round((bb.y + bb.height) * 10) / 10, fill: (st.match(/fill: *([^;]+)/) || [])[1] || '' }
  })
  return { viewBox: svg.getAttribute('viewBox'), rows, oct: rows.find((r) => r.ym === '2026-10'), greens: paths.filter((x) => x.fill === 'rgb(0, 255, 0)') }
})

console.log(JSON.stringify(geo, null, 1))

// Align the October row near the top so the screenshot shows the boundary
// exactly where the user saw the wedge (row above Oct 1).
await p.evaluate(() => {
  const scroll = document.querySelector('[data-calendar-scroll]')
  const octRow = [...scroll.querySelectorAll('div[data-month]')].find((r) => {
    const [y, m] = (r.getAttribute('data-month') || '0-0').split('-').map(Number)
    let mo = m + 1, yr = y
    if (mo > 12) { mo = 1; yr += 1 }
    return `${yr}-${String(mo).padStart(2, '0')}` === '2026-10'
  })
  if (octRow) scroll.scrollTop = octRow.offsetTop - 60
})
await p.waitForTimeout(400)

const card = await p.$('[data-calendar]')
await card.screenshot({ path: out })
console.log('saved', out)
await b.close()