// Emulate real-user conditions (Android font scaling, tiny/landscape viewports)
// and PIXEL-check the tint shape: band must start exactly at month-1 row top,
// span the right columns, and NOT look like a wedge/hill/blob.
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

const cases = [
  { name: 'android-font-130', width: 412, height: 915, dpr: 2.625, fontPct: '130%' },
  { name: 'android-font-150', width: 390, height: 844, dpr: 3, fontPct: '150%' },
  { name: 'tiny-320', width: 320, height: 568, dpr: 2, fontPct: '100%' },
  { name: 'landscape', width: 932, height: 430, dpr: 2.625, fontPct: '100%' },
  { name: 'plain-390', width: 390, height: 844, dpr: 3, fontPct: '100%' },
]

const b = await chromium.launch()
for (const c of cases) {
  const p = await b.newPage({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: c.dpr,
    isMobile: true,
    hasTouch: true,
  })
  await p.goto(BASE)
  await p.waitForTimeout(800)
  await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
  await p.reload()
  await p.waitForTimeout(1200)
  // emulate Android font scaling
  await p.evaluate((fp) => {
    document.documentElement.style.fontSize = fp
  }, c.fontPct)
  await p.waitForTimeout(1200)

  const m = await p.evaluate(() => {
    const svg = document.querySelector('svg[aria-hidden="true"]')
    const scroll = document.querySelector('[data-calendar-scroll]')
    if (!svg || !scroll) return { err: 'missing' }
    // recolor tint red for unambiguous pixel detection
    for (const q of svg.querySelectorAll('path')) q.setAttribute('style', 'fill: #ff0000;')
    const rect = svg.getBoundingClientRect()
    const srect = scroll.getBoundingClientRect()
    const top = Math.max(rect.y, srect.y)
    const bottom = Math.min(rect.y + rect.height, srect.y + srect.height)
    const rows = [...scroll.querySelectorAll('div[data-month]')].map((r) => {
      const rr = r.getBoundingClientRect()
      const [y, mo] = (r.getAttribute('data-month') || '0-0').split('-').map(Number)
      let mm = mo + 1, yy = y
      if (mm > 12) { mm = 1; yy += 1 }
      return { ym: `${yy}-${String(mm).padStart(2, '0')}`, top: Math.round(rr.top), bot: Math.round(rr.bottom) }
    }).filter((r) => r.bot > top && r.top < bottom)
    return { scrollTop: scroll.scrollTop, y: Math.round(top), h: Math.round(bottom - top), w: Math.round(rect.width), rows, dpr: window.devicePixelRatio }
  })
  const shotPath = `/tmp/tint-case-${c.name}.png`
  await p.screenshot({ path: shotPath, clip: { x: 0, y: m.y, width: Math.round(m.w + 40), height: m.h } })
  // pixel measure red bands
  // measure in node via spawn python
  console.log(`CASE ${c.name}: scrollTop=${m.scrollTop} dpr=${m.dpr} rows=${JSON.stringify(m.rows)} shot=${shotPath}`)
  await p.close()
}
await b.close()