// BLOOM sheet-reveal E2E — tapping a day near the bottom of the calendar's
// visible area opens the cycle-day bottom sheet over it; the calendar must
// auto-scroll so the tapped day (with its selection ring) stays visible in
// the strip above the sheet. Days already above the sheet must NOT move.
// Prereq: dev server (npx vite --port 5180), run from the worktree dir:
//   node .scratch/bloom-sheet-reveal-e2e.cjs
const { chromium } = require('playwright')

const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5180/'
const isoAdd = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const today = new Date().toISOString().slice(0, 10)

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const fail = (msg) => { console.log('FAIL:', msg); process.exitCode = 1 }
  const pass = (msg) => console.log('ok  -', msg)

  const geom = () =>
    page.evaluate(() => {
      const scroller = document.querySelector('[data-calendar-scroll]')
      const sr = scroller.getBoundingClientRect()
      const cells = [...scroller.querySelectorAll('button[aria-label]')]
        .map((b) => {
          const r = b.getBoundingClientRect()
          return { iso: b.getAttribute('aria-label'), top: r.top, bottom: r.bottom, x: r.x, w: r.width, h: r.height }
        })
        .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.iso) && c.top >= sr.top - 0.5 && c.bottom <= sr.bottom + 0.5)
        .sort((a, b) => a.bottom - b.bottom)
      return {
        scrollTop: scroller.scrollTop,
        scroller: { top: sr.top, bottom: sr.bottom, height: sr.height },
        visible: cells,
      }
    })

  // 1) Bottom-most fully visible day → the popup sheet will cover it.
  let g = await geom()
  const bottomDay = g.visible[g.visible.length - 1]
  if (!bottomDay) return fail('no fully-visible day found')
  const scrollBefore = g.scrollTop
  await page.mouse.click(bottomDay.x + bottomDay.w / 2, bottomDay.top + bottomDay.h / 2)
  await page.waitForSelector('[data-sheet][aria-modal="true"]')
  await page.waitForTimeout(250) // reveal rAF + paint

  const sheetState = await page.evaluate((iso) => {
    const scroller = document.querySelector('[data-calendar-scroll]')
    const panel = document.querySelector('[data-sheet]').firstElementChild
    const cell = scroller.querySelector(`button[aria-label="${iso}"]`)
    const pr = panel.getBoundingClientRect()
    const cr = cell.getBoundingClientRect()
    return { scrollTop: scroller.scrollTop, panelTop: pr.top, cellBottom: cr.bottom, cellTop: cr.top }
  }, bottomDay.iso)

  if (sheetState.cellBottom <= sheetState.panelTop) {
    pass(`covered day ${bottomDay.iso} revealed: cellBottom ${sheetState.cellBottom.toFixed(1)} <= sheet top ${sheetState.panelTop.toFixed(1)}`)
  } else {
    fail(`day ${bottomDay.iso} still behind sheet: cellBottom ${sheetState.cellBottom.toFixed(1)} > panelTop ${sheetState.panelTop.toFixed(1)}`)
  }
  if (sheetState.scrollTop > scrollBefore + 0.5) {
    pass(`calendar scrolled down: ${scrollBefore.toFixed(1)} -> ${sheetState.scrollTop.toFixed(1)}`)
  } else {
    fail(`expected scrollTop increase (was ${scrollBefore.toFixed(1)}, now ${sheetState.scrollTop.toFixed(1)})`)
  }
  // The revealed day must still be inside the scroller's viewport (top edge visible).
  await page.screenshot({ path: '.scratch/sheet-reveal-covered.png' })

  // 2) Close via the sheet's ✕; tap a TOP-visible day → sheet does NOT cover
  // it → no scroll.
  await page.click('button[aria-label="Close"]')
  await page.waitForTimeout(300)
  g = await geom()
  const topDay = g.visible[0]
  if (!topDay) return fail('no top day found')
  const scrollBefore2 = g.scrollTop
  await page.mouse.click(topDay.x + topDay.w / 2, topDay.top + topDay.h / 2)
  await page.waitForSelector('[data-sheet][aria-modal="true"]')
  await page.waitForTimeout(250)
  const st2 = await page.evaluate((iso) => {
    const scroller = document.querySelector('[data-calendar-scroll]')
    const panel = document.querySelector('[data-sheet]').firstElementChild
    const cell = scroller.querySelector(`button[aria-label="${iso}"]`)
    const pr = panel.getBoundingClientRect()
    const cr = cell.getBoundingClientRect()
    return { scrollTop: scroller.scrollTop, panelTop: pr.top, cellBottom: cr.bottom }
  }, topDay.iso)

  if (st2.cellBottom <= st2.panelTop) {
    pass(`top day ${topDay.iso} was already visible: cellBottom ${st2.cellBottom.toFixed(1)} <= sheet top ${st2.panelTop.toFixed(1)}`)
  } else {
    fail(`top day ${topDay.iso} unexpectedly covered: cellBottom ${st2.cellBottom.toFixed(1)} > panelTop ${st2.panelTop.toFixed(1)}`)
  }
  if (Math.abs(st2.scrollTop - scrollBefore2) < 0.5) {
    pass(`no scroll for already-visible day (${scrollBefore2.toFixed(1)} -> ${st2.scrollTop.toFixed(1)})`)
  } else {
    fail(`top day scrolled unnecessarily: ${scrollBefore2.toFixed(1)} -> ${st2.scrollTop.toFixed(1)}`)
  }
  await page.screenshot({ path: '.scratch/sheet-reveal-top.png' })

  console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'page errors: none')
  await browser.close()
  if (!process.exitCode) console.log('DONE')
})()
