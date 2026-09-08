// Durable-fix verification (2026-09-08): confirm the month-tint SVG is now on
// its own composited layer (translateZ(0) + will-change:transform) AND that the
// tint geometry is unchanged (green bands track even-month cells exactly) while
// flinging at phone viewports with the user's real #00ff00 tint.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const port = process.argv[2] || '5211'
const BASE = `http://localhost:${port}/`
mkdirSync('/tmp/flickfix', { recursive: true })

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
  { name: 'phone-390', width: 390, height: 844, dpr: 3, fontPct: '100%' },
  { name: 'phone-412', width: 412, height: 915, dpr: 2.625, fontPct: '100%' },
  { name: 'tiny-345x251', width: 345, height: 251, dpr: 3.166, fontPct: '100%' },
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
  await p.waitForTimeout(600)
  await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
  await p.reload()
  await p.waitForTimeout(1500)

  // DOM-level compositing + geometry assertions
  const dom = await p.evaluate(() => {
    const svg = document.querySelector('svg[aria-hidden="true"]')
    const cs = svg ? getComputedStyle(svg) : null
    const style = svg ? svg.getAttribute('style') || '' : ''
    const scroll = document.querySelector('[data-calendar-scroll]')
    const tintW = svg ? svg.parentElement : null
    // paint-order guarantee: rows must be AFTER the svg in the wrapper
    const rowsAfterSvg = tintW ? [...tintW.children].filter((el) => el !== svg).every((el) => el.hasAttribute('data-month')) : false
    const paths = svg ? [...svg.querySelectorAll('path')] : []
    const fills = paths.map((p) => p.getAttribute('style') || '')
    // visible even-month cells extents (top/bottom of their day buttons), by month
    const btnRects = {}
    for (const btn of document.querySelectorAll('button[aria-label^="2026-"]')) {
      const iso = btn.getAttribute('aria-label')
      const mk = iso.slice(0, 7)
      if (!btnRects[mk]) btnRects[mk] = { top: 1e9, bot: -1e9, n: 0 }
      const r = btn.getBoundingClientRect()
      btnRects[mk].top = Math.min(btnRects[mk].top, r.top)
      btnRects[mk].bot = Math.max(btnRects[mk].bot, r.bottom)
      btnRects[mk].n += 1
    }
    return {
      hasSvg: !!svg,
      inlineTransform: /translateZ/.test(style) || /translate3d|matrix3d/.test(style),
      inlineWillChange: /will-change:\s*transform/.test(style),
      computedTransform: cs ? cs.transform : null,
      computedWillChange: cs ? cs.willChange : null,
      rowsAfterSvg,
      pathCount: paths.length,
      fills,
      btnRects,
      scrollH: scroll ? scroll.scrollHeight : 0,
      clientH: scroll ? scroll.clientHeight : 0,
      scrollTop: scroll ? scroll.scrollTop : 0,
    }
  })
  console.log(`\n== DOM ${c.name} ==`)
  console.log(JSON.stringify(dom, null, 1).slice(0, 1600))

  // Fling-capture: rapid scroll deltas at rAF-ish cadence, viewport clip of the
  // scroll box (mid-fling frames — where the phone artifact would appear)
  const clip = await p.evaluate(() => {
    const s = document.querySelector('[data-calendar-scroll]')
    if (!s) return null
    const r = s.getBoundingClientRect()
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height }
  })
  if (clip && clip.width > 50 && clip.height > 50) {
    // ensure we fling across tinted months: scroll far enough up then fling down
    await p.evaluate(() => {
      const s = document.querySelector('[data-calendar-scroll]')
      s.scrollTop = 0
    })
    await p.waitForTimeout(900)
    await p.evaluate(() => {
      const s = document.querySelector('[data-calendar-scroll]')
      if (s.scrollHeight > s.clientHeight) s.scrollTop = (s.scrollHeight - s.clientHeight) * 0.72
    })
    await p.waitForTimeout(700)
    for (let i = 0; i < 14; i++) {
      await p.evaluate(() => {
        const s = document.querySelector('[data-calendar-scroll]')
        s.scrollTop -= 46
      })
      await p.screenshot({ clip, path: `/tmp/flickfix/${c.name}-f${String(i).padStart(2, '0')}.png` })
    }
    // second pass scrolling forward (down) across even months
    for (let i = 0; i < 10; i++) {
      await p.evaluate(() => {
        const s = document.querySelector('[data-calendar-scroll]')
        s.scrollTop += 58
      })
      await p.screenshot({ clip, path: `/tmp/flickfix/${c.name}-g${String(i).padStart(2, '0')}.png` })
    }
    console.log(`frames ${c.name}: /tmp/flickfix/${c.name}-f00..g09`)
  } else {
    console.log(`SKIP fling ${c.name}: clip ${JSON.stringify(clip)} (collapsed scrollbox)`)
  }
  await p.close()
}
await b.close()
console.log('\nDONE')
