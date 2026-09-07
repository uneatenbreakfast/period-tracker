// Force the stale-geom race: block rAF+RO, trigger a prepend, and verify the
// SVG never renders unit paths into a px viewBox (the malformed-blob mode).
// With the fix, mismatched geom → NO tint paths (blank) instead of malformed.
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
const p = await b.newPage({
  viewport: { width: 430, height: 667 },
  deviceScaleFactor: 2.456,
  isMobile: true,
  hasTouch: true,
})
await p.goto(BASE)
await p.waitForTimeout(1000)
await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
await p.reload()
await p.waitForTimeout(1500)

const dump = () => p.evaluate(() => {
  const svg = document.querySelector('svg[aria-hidden="true"]')
  const scroll = document.querySelector('[data-calendar-scroll]')
  if (!svg) return { error: 'no svg' }
  const vbox = svg.getAttribute('viewBox')
  const style = svg.getAttribute('style') || '(none)'
  const paths = [...svg.querySelectorAll('path')].map((q) => {
    const bb = q.getBBox()
    return { y: Math.round(bb.y), h: Math.round(bb.height), x: Math.round(bb.x), w: Math.round(bb.width) }
  })
  return {
    vbox,
    style: style.slice(0, 40),
    pathCount: paths.length,
    // Malformed marker: a path whose bbox x/y look like tiny unit coords
    // (e.g. x<20, y<40 integer rows) inside a px viewBox — the old bug.
    paths: paths.slice(0, 8),
    scrollTop: Math.round(scroll.scrollTop),
  }
})

console.log('ALIGNED STATE:')
console.log(JSON.stringify(await dump(), null, 1))

// Break measurement: block RO + rAF so any mid-remount bail can't recover.
await p.evaluate(() => {
  window.__ro = window.ResizeObserver
  window.ResizeObserver = undefined
  window.__raf = window.requestAnimationFrame
  window.requestAnimationFrame = undefined
  const s = document.querySelector('[data-calendar-scroll]')
  s.scrollTop = 0
  s.dispatchEvent(new Event('scroll'))
})
await p.waitForTimeout(600)
console.log('\nAFTER PREPEND + RO/rAF BLOCKED (stale-geom window):')
console.log(JSON.stringify(await dump(), null, 1))
await p.screenshot({ path: '/tmp/stale-geom.png' })
await b.close()