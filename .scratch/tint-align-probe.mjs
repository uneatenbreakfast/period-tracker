// Precise DOM + tint alignment probe: map every month block & week row vs green paths.
import { chromium } from 'playwright'

const port = process.argv[2] || '5198'
const BASE = `http://localhost:${port}/`
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
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true })
await p.goto(BASE)
await p.waitForTimeout(800)
await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
await p.reload()
await p.waitForTimeout(2200)

const out = await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const scroll = document.querySelector('[data-calendar-scroll]')
  const svgRect = svg.getBoundingClientRect()
  const rows = [...scroll.querySelectorAll('div[data-month]')].map((r) => {
    const rr = r.getBoundingClientRect()
    const [y, m] = (r.getAttribute('data-month') || '0-0').split('-').map(Number)
    let mo = m + 1, yr = y
    if (mo > 12) { mo = 1; yr += 1 }
    return { ym: `${yr}-${String(mo).padStart(2, '0')}`, top: Math.round((rr.top - svgRect.top) * 10) / 10, h: Math.round(rr.height * 10) / 10, label: (r.querySelector('*') && r.textContent || '').slice(0, 30) }
  })
  const paths = [...svg.querySelectorAll('path')].map((q) => {
    const bb = q.getBBox()
    const st = q.getAttribute('style') || ''
    return { y: Math.round(bb.y * 10) / 10, y2: Math.round((bb.y + bb.height) * 10) / 10, w: Math.round(bb.width), fill: (st.match(/fill: *([^;]+)/) || [])[1] || '' }
  })
  // inner structure of one month block, e.g. August (data-month 2026-07)
  const augBlock = scroll.querySelector('[data-month="2026-7"]') || scroll.querySelector('[data-month="2026-08"]')
  let inner = null
  if (augBlock) {
    const ar = augBlock.getBoundingClientRect()
    inner = [...augBlock.children].map((c) => {
      const cr = c.getBoundingClientRect()
      return { tag: c.tagName, cls: c.className.slice(0, 40), top: Math.round((cr.top - ar.top) * 10) / 10, h: Math.round(cr.height * 10) / 10 }
    })
  }
  return { vbox: svg.getAttribute('viewBox'), rows, paths, inner, svgW: Math.round(svgRect.width) }
})
console.log(JSON.stringify(out, null, 1))
await b.close()