// Reproduce USER scenario: long period history, scroll back to older months
// (window prepend path — the exact stale-geom trigger), then check tint alignment.
// Seeds 18 months of entries so the calendar starts deep; scrolls to top to force prepends.
import { chromium } from 'playwright'

const port = process.argv[2] || '5190'
const BASE = `http://localhost:${port}/`

// 18 months of period runs (medium flow, 5-day runs every 28 days from 2025-03)
const entries = []
let d = new Date(2025, 2, 5) // 2025-03-05
for (let i = 0; i < 19; i++) {
  for (let k = 0; k < 6; k++) {
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k)
    entries.push({ date: dd.toISOString().slice(0, 10), flow: 'medium', symptoms: [] })
  }
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 28)
}

const snap = {
  version: 1,
  entries,
  settings: { cycleLength: 28, periodLength: 5, style: { monthTint: '#00ff00' } },
  updatedAt: new Date().toISOString(),
}

const viewports = [
  { name: 'phone-tall', width: 430, height: 932, dpr: 2.75 },
  { name: 'phone-short', width: 375, height: 667, dpr: 3 },
  { name: 'desktop', width: 1280, height: 720, dpr: 1 },
]

const b = await chromium.launch()
const results = []
for (const vp of viewports) {
  const p = await b.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: true,
    hasTouch: true,
  })
  await p.goto(BASE)
  await p.waitForTimeout(800)
  await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
  await p.reload()
  await p.waitForTimeout(2000)

  // Scroll to TOP -> forces prepend of earlier months (stale-geom trigger), then
  // scroll to a mid-history position where an even month (tinted) is visible.
  await p.evaluate(() => {
    const scroll = document.querySelector('[data-calendar-scroll]')
    scroll.scrollTop = 0
  })
  await p.waitForTimeout(1200)
  await p.evaluate(() => {
    const scroll = document.querySelector('[data-calendar-scroll]')
    scroll.scrollTop = 3000
  })
  await p.waitForTimeout(1200)

  const out = await p.evaluate(() => {
    const svg = document.querySelector('svg[aria-hidden="true"]')
    const scroll = document.querySelector('[data-calendar-scroll]')
    if (!svg || !scroll) return { error: 'missing elements' }
    const vbox = svg.getAttribute('viewBox')
    const svgRect = svg.getBoundingClientRect()
    const rows = [...scroll.querySelectorAll('div[data-month]')].map((r) => {
      const rr = r.getBoundingClientRect()
      const [y, m] = (r.getAttribute('data-month') || '0-0').split('-').map(Number)
      let mo = m + 1, yr = y
      if (mo > 12) { mo = 1; yr += 1 }
      return { ym: `${yr}-${String(mo).padStart(2, '0')}`, top: rr.top - svgRect.top, h: rr.height }
    })
    const paths = [...svg.querySelectorAll('path')].map((path) => {
      const bb = path.getBBox()
      const st = path.getAttribute('style') || ''
      return { y: Math.round(bb.y * 10) / 10, y2: Math.round((bb.y + bb.height) * 10) / 10, fill: (st.match(/fill: *([^;]+)/) || [])[1] || '' }
    })
    return { vbox, rowCount: rows.length, rows, greens: paths.filter((x) => x.fill === 'rgb(0, 255, 0)') }
  })

  if (out.error) { console.log(vp.name, out.error); await p.close(); continue }
  // For each green band, find nearest row anchor and report delta
  let maxDelta = 0
  const deltas = []
  for (const g of out.greens) {
    let best = null
    for (const r of out.rows) {
      const delta = Math.abs(g.y - r.top)
      if (!best || delta < best.delta) best = { ym: r.ym, delta: Math.round(delta * 10) / 10 }
    }
    deltas.push({ band: `${g.y}..${g.y2}`, nearest: best })
    if (best.delta > maxDelta) maxDelta = best.delta
  }
  console.log(`\n===== ${vp.name} ===== rows=${out.rowCount} vbox=${out.vbox}`)
  console.log(JSON.stringify(deltas, null, 1))
  console.log('MAX DELTA:', maxDelta, maxDelta < 1.5 ? 'ALIGNED' : 'MISALIGNED')
  results.push({ vp: vp.name, maxDelta })
  await p.close()
}
await b.close()
console.log('\n=== SUMMARY ===')
for (const r of results) console.log(r.vp, r.maxDelta, r.maxDelta < 1.5 ? 'ALIGNED' : 'MISALIGNED')