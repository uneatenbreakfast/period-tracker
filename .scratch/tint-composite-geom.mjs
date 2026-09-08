// Composite-layer + geometry regression probe (2026-09-08): asserts the tint
// SVG carries the compositing fix AND that every green path's bbox still aligns
// to its even month's real cell extents (y within 3px) at phone viewports.
import { chromium } from 'playwright'

const port = process.argv[2] || '5211'
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
const cases = [
  { name: 'phone-390', width: 390, height: 844, dpr: 3 },
  { name: 'phone-412', width: 412, height: 915, dpr: 2.625 },
  { name: 'desktop-1x', width: 1280, height: 900, dpr: 1 },
]

const b = await chromium.launch()
let fail = 0
for (const c of cases) {
  const p = await b.newPage({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: c.dpr,
    isMobile: c.dpr > 1,
    hasTouch: c.dpr > 1,
  })
  await p.goto(BASE)
  await p.waitForTimeout(600)
  await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
  await p.reload()
  await p.waitForTimeout(1600)
  const r = await p.evaluate(() => {
    const scroll = document.querySelector('[data-calendar-scroll]')
    const svg = scroll?.querySelector('svg[aria-hidden="true"]')
    const wrapper = scroll?.querySelector(':scope > div.relative')
    if (!scroll || !svg || !wrapper) return { err: 'missing svg/scroll/wrapper' }
    const cs = getComputedStyle(svg)
    const layerOk = /transform|matrix/.test(cs.transform) && cs.willChange === 'transform'
    const rows = [...wrapper.children].filter((el) => el !== svg && el.matches('div'))
    // per-row div bounds (these are the EXACT rowTops/rowHeights the SVG uses)
    const rowRects = rows.map((r) => {
      const b = r.getBoundingClientRect()
      return { top: b.top, bot: b.bottom }
    })
    // which month keys each row holds (non-pad inMonth buttons)
    const rowMonths = rows.map((r) => {
      const s = new Set()
      for (const btn of r.querySelectorAll('button[aria-label]')) {
        const iso = btn.getAttribute('aria-label')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || (btn.className || '').includes('opacity-15')) continue
        s.add(iso.slice(0, 7))
      }
      return s
    })
    // green path bboxes vs their month's first/last ROW div extents
    const errors = []
    let green = 0
    for (const path of svg.querySelectorAll('path')) {
      if (!/rgb\(0,\s*255,\s*0\)/.test(path.getAttribute('style') || '')) continue
      green++
      const bb = path.getBoundingClientRect()
      const cy = bb.top + bb.height / 2
      let wi = rowRects.findIndex((rr) => cy >= rr.top && cy <= rr.bot)
      if (wi < 0) { errors.push(`path@y${Math.round(bb.top)} no-row`); continue }
      const mk = [...rowMonths[wi]].find((k) => Number(k.slice(5)) % 2 === 0)
      if (!mk) { errors.push(`path@y${Math.round(bb.top)} no-even-month`); continue }
      const first = rowRects.findIndex((_, i) => rowMonths[i].has(mk))
      let last = -1
      rowRects.forEach((_, i) => { if (rowMonths[i].has(mk)) last = i })
      if (Math.abs(bb.top - rowRects[first].top) > 1) errors.push(`${mk} top ${Math.round(bb.top)} vs row ${Math.round(rowRects[first].top)}`)
      if (Math.abs(bb.bottom - rowRects[last].bot) > 1) errors.push(`${mk} bot ${Math.round(bb.bottom)} vs row ${Math.round(rowRects[last].bot)}`)
    }
    const evenVisible = [...new Set(rowMonths.flatMap((s) => [...s]))].filter((k) => Number(k.slice(5)) % 2 === 0).length
    return {
      layerOk, csTransform: cs.transform, csWillChange: cs.willChange,
      green, evenMonthsVisible: evenVisible,
      errors: errors.slice(0, 12), errorCount: errors.length,
    }
  })
  const ok = r.errorCount === 0 && r.green >= 2 && r.green === r.evenMonthsVisible && r.layerOk
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: layer=${r.layerOk} (${r.csTransform}, ${r.csWillChange}) green=${r.green} evenVisible=${r.evenMonthsVisible} errors=${r.errorCount}${r.errors?.length ? ' ' + r.errors.join(' | ') : ''}${r.err ? ' ' + r.err : ''}`)
  await p.close()
}
await b.close()
console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`)
process.exit(fail === 0 ? 0 : 1)
