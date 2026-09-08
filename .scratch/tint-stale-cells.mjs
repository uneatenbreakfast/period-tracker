// Check per-cell tint vs SVG band under FORCED stale geometry:
// prepend months (remount rows) while rAF is blocked so measure() can't finish
// -> tintGeomOk false -> monthBgPaths = [] but per-cell monthTint may still paint.
// Also sample computed bg of cells in a tinted month to see if blobs appear.
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
await p.waitForTimeout(1500)

// normal state first: count SVG paths + cell backgrounds
const normal = await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const paths = svg ? [...svg.querySelectorAll('path')].filter((q) => q.getAttribute('style')?.includes('00ff00')).length : 0
  const cells = [...document.querySelectorAll('button[data-iso]')]
  const tintedCells = cells.filter((c) => {
    const st = c.querySelector('span')?.getAttribute('style') || ''
    return st.includes('00ff00')
  }).length
  return { paths, tintedCells, totalCells: cells.length }
})
console.log('NORMAL:', JSON.stringify(normal))

// FORCE stale: block rAF, then trigger a prepend by scrolling to top
await p.evaluate(() => {
  window.__raf = window.requestAnimationFrame
  window.requestAnimationFrame = () => 0
  const scroll = document.querySelector('[data-calendar-scroll]')
  scroll.scrollTop = 0
})
await p.waitForTimeout(600)
await p.evaluate(() => {
  const scroll = document.querySelector('[data-calendar-scroll]')
  scroll.scrollTop = 0
})
await p.waitForTimeout(800)

const stale = await p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const paths = svg ? [...svg.querySelectorAll('path')].filter((q) => q.getAttribute('style')?.includes('00ff00')).length : 0
  const vbox = svg?.getAttribute('viewBox') || 'none'
  const cells = [...document.querySelectorAll('button[data-iso]')]
  const tintedCells = cells.filter((c) => {
    const st = c.querySelector('span')?.getAttribute('style') || ''
    return st.includes('00ff00')
  }).length
  return { paths, vbox, tintedCells, totalCells: cells.length }
})
console.log('FORCED-STALE:', JSON.stringify(stale))

// restore rAF
await p.evaluate(() => { window.requestAnimationFrame = window.__raf })
await p.close()
await b.close()