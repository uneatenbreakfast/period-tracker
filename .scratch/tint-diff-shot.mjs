// Diff the tint: screenshot SVG region with paths visible vs hidden.
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

const info = await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const rect = svg.getBoundingClientRect()
  const scroll = document.querySelector('[data-calendar-scroll]')
  const srect = scroll.getBoundingClientRect()
  // capture the currently VISIBLE slice of the grid (within the scroll viewport)
  const top = Math.max(rect.y, srect.y)
  const bottom = Math.min(rect.y + rect.height, srect.y + srect.height)
  return { x: Math.round(rect.x), y: Math.round(top), w: Math.round(rect.width), h: Math.round(bottom - top) }
})
console.log('SVG RECT', JSON.stringify(info))

await p.screenshot({ path: '/tmp/with-tint.png', clip: { x: info.x, y: info.y, width: info.w, height: Math.min(800, info.h) } })
await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  for (const q of svg.querySelectorAll('path')) q.style.display = 'none'
})
await p.waitForTimeout(300)
await p.screenshot({ path: '/tmp/no-tint.png', clip: { x: info.x, y: info.y, width: info.w, height: Math.min(800, info.h) } })
console.log('done')
await b.close()