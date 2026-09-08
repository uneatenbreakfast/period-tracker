// Pure tint: EMPTY entries (no period/fertile/predicted overlays).
// Recolor tint paths red + dump month anchors + measure red-painted rows.
import { chromium } from 'playwright'

const port = process.argv[2] || '5190'
const BASE = `http://localhost:${port}/`
const snap = {
  version: 1,
  entries: [],
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

await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  for (const q of svg.querySelectorAll('path')) q.setAttribute('style', 'fill: #ff0000;')
})

const box = await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const scroll = document.querySelector('[data-calendar-scroll]')
  const rect = svg.getBoundingClientRect()
  const srect = scroll.getBoundingClientRect()
  const top = Math.max(rect.y, srect.y)
  const bottom = Math.min(rect.y + rect.height, srect.y + srect.height)
  const rows = [...scroll.querySelectorAll('div[data-month]')].map((r) => {
    const rr = r.getBoundingClientRect()
    const [y, m] = (r.getAttribute('data-month') || '0-0').split('-').map(Number)
    let mo = m + 1, yr = y
    if (mo > 12) { mo = 1; yr += 1 }
    return { ym: `${yr}-${String(mo).padStart(2, '0')}`, screenTop: Math.round(rr.top), screenBot: Math.round(rr.bottom) }
  }).filter((r) => r.screenBot > top && r.screenTop < bottom)
  // also all week-row rects
  const weekRows = [...scroll.querySelectorAll('div[data-month]')].map((r) => {
    const rr = r.getBoundingClientRect()
    return { top: Math.round(rr.top), bot: Math.round(rr.bottom) }
  }).filter((r) => r.bot > top && r.top < bottom)
  return { y: Math.round(top), h: Math.round(bottom - top), rows, weekRows }
})
console.log('BOX', JSON.stringify(box))

await p.screenshot({ path: '/tmp/tint-red-empty.png', clip: { x: 36, y: box.y, width: 358, height: box.h } })
await b.close()