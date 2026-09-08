// Recolor tint paths red so the painted shape is unambiguous, screenshot visible
// slice, and print exact red-region geometry per row + month-row anchors.
import { chromium } from 'playwright'

const port = process.argv[2] || '5190'
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
await p.waitForTimeout(2000)

// Recolor the tint paths red
const pathInfo = await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const paths = [...svg.querySelectorAll('path')]
  paths.forEach((q) => q.setAttribute('style', 'fill: #ff0000;'))
  return { count: paths.length }
})
console.log('PATH COUNT', JSON.stringify(pathInfo))

const box = await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const scroll = document.querySelector('[data-calendar-scroll]')
  const rect = svg.getBoundingClientRect()
  const srect = scroll.getBoundingClientRect()
  const top = Math.max(rect.y, srect.y)
  const bottom = Math.min(rect.y + rect.height, srect.y + srect.height)
  // rows: month anchors + actual visible week rows
  const rows = [...scroll.querySelectorAll('div[data-month]')].map((r) => {
    const rr = r.getBoundingClientRect()
    const [y, m] = (r.getAttribute('data-month') || '0-0').split('-').map(Number)
    let mo = m + 1, yr = y
    if (mo > 12) { mo = 1; yr += 1 }
    return { ym: `${yr}-${String(mo).padStart(2, '0')}`, screenTop: Math.round(rr.top), screenBot: Math.round(rr.bottom) }
  }).filter((r) => r.screenBot > top && r.screenTop < bottom)
  return { x: Math.round(rect.x), y: Math.round(top), w: Math.round(rect.width), h: Math.round(bottom - top), rows }
})
console.log('BOX', JSON.stringify(box, null, 0))

await p.screenshot({ path: '/tmp/tint-red.png', clip: { x: box.x, y: box.y, width: box.w, height: box.h } })
await b.close()