// Multi-viewport geometry sweep: find where tint paths stop aligning with rows.
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

const viewports = [
  { name: 'tall', width: 430, height: 932, dpr: 2.75 },
  { name: 'short', width: 430, height: 667, dpr: 2.456 },
  { name: 'mid', width: 412, height: 800, dpr: 3 },
  { name: 'tiny', width: 375, height: 667, dpr: 3 },
  { name: 'wide', width: 1280, height: 720, dpr: 1 },
]

const b = await chromium.launch()

for (const vp of viewports) {
  const p = await b.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: true,
    hasTouch: true,
  })
  await p.goto(BASE)
  await p.waitForTimeout(1000)
  await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
  await p.reload()
  await p.waitForTimeout(2000)

  const out = await p.evaluate(() => {
    const svg = document.querySelector('svg[aria-hidden="true"]')
    const scroll = document.querySelector('[data-calendar-scroll]')
    if (!svg || !scroll) return { error: 'missing elements' }
    const vbox = svg.getAttribute('viewBox')
    const style = svg.getAttribute('style') || ''
    const svgRect = svg.getBoundingClientRect()

    const rows = [...scroll.querySelectorAll('div[data-month]')]
    const rowRects = rows.map((r) => {
      const rr = r.getBoundingClientRect()
      // data-month = month BEFORE the row's 1st; actual = +1
      const [y, m] = (r.getAttribute('data-month') || '0-0').split('-').map(Number)
      let mo = m + 1
      let yr = y
      if (mo > 12) { mo = 1; yr += 1 }
      return { ym: `${yr}-${String(mo).padStart(2, '0')}`, top: rr.top - svgRect.top, h: rr.height }
    })

    const paths = [...svg.querySelectorAll('path')].map((path) => {
      const bb = path.getBBox()
      const styleAttr = path.getAttribute('style') || ''
      return {
        y: bb.y, y2: bb.y + bb.height,
        fill: (styleAttr.match(/fill: *([^;]+)/) || [])[1] || '',
      }
    })

    return {
      vbox,
      style,
      scrollTop: scroll.scrollTop,
      clientH: scroll.clientHeight,
      rowCount: rows.length,
      rows: rowRects,
      paths,
    }
  })

  console.log(`\n===== ${vp.name} ${vp.width}x${vp.height} dpr${vp.dpr} =====`)
  if (out.error) { console.log(out.error); await p.close(); continue }
  console.log('vbox:', out.vbox, '| style:', out.style.slice(0, 60), '| scrollTop:', out.scrollTop, 'clientH:', out.clientH)
  console.log('green paths:')
  for (const pth of out.paths.filter((x) => x.fill === 'rgb(0, 255, 0)')) {
    console.log(`  y=${pth.y.toFixed(1)}..${pth.y2.toFixed(1)}`)
  }
  console.log('rows (month-start anchors):')
  for (const r of out.rows) {
    console.log(`  ${r.ym} top=${r.top.toFixed(1)} h=${r.h.toFixed(1)}`)
  }
  await p.close()
}

await b.close()