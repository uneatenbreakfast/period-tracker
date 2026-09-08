// Real-data deep-scroll probe (2026-09-08): seed the user's ACTUAL backup
// (55 entries, 2012 + 2025-12..2027-01, monthTint #00ff00). Drive the calendar
// back toward 2012 (giant window: ~180 months / hundreds of rows). Assert:
//   1. composited layer style survives prepends
//   2. tint path count NEVER drops to 0 during the whole deep scroll
//      (no tint-dip flash window)
//   3. green bands still align to even-month row extents at depth
// Capture frames for pixel + vision scan.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const port = process.argv[2] || '5211'
const BASE = `http://localhost:${port}/`
const SNAP = JSON.parse(readFileSync('/mnt/c/Repos/hermes-dashboard/user-uploads/api_1788859756_86cdd1d4/bloom-backup-2026-09-08__1_.json', 'utf8'))
mkdirSync('/tmp/flickdeep', { recursive: true })

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await p.goto(BASE)
await p.waitForTimeout(600)
await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), SNAP)
await p.reload()
await p.waitForTimeout(2000)

const state = await p.evaluate(() => {
  const scroll = document.querySelector('[data-calendar-scroll]')
  return { scrollH: scroll.scrollHeight, clientH: scroll.clientHeight, scrollTop: scroll.scrollTop }
})
console.log('initial:', JSON.stringify(state))

// sample tint + layer state, dip-free check
const samples = []
let minPaths = 1e9
for (let i = 0; i < 40; i++) {
  const s = await p.evaluate(() => {
    const scroll = document.querySelector('[data-calendar-scroll]')
    const svg = scroll.querySelector('svg[aria-hidden="true"]')
    const cs = getComputedStyle(svg)
    const paths = svg.querySelectorAll('path').length
    const greens = [...svg.querySelectorAll('path')].filter((pa) => /rgb\(0,\s*255,\s*0\)/.test(pa.getAttribute('style') || '')).length
    return { st: Math.round(scroll.scrollTop), sh: scroll.scrollHeight, paths, greens, layer: cs.willChange === 'transform' && /matrix/.test(cs.transform) }
  })
  samples.push(s)
  if (s.greens < minPaths) minPaths = s.greens
  if (s.st <= 0) {
    // pinned top: upward kick triggers the next history prepend (wheel path)
    await p.mouse.move(195, 400)
    await p.mouse.wheel(0, -600)
  } else {
    await p.evaluate(() => { const sc = document.querySelector('[data-calendar-scroll]'); sc.scrollTop -= 700 })
  }
  // capture a mid-transition frame every 5th sample
  if (i % 5 === 0) {
    const clip = await p.evaluate(() => {
      const r = document.querySelector('[data-calendar-scroll]').getBoundingClientRect()
      return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height }
    })
    await p.screenshot({ clip, path: `/tmp/flickdeep/d${String(i).padStart(2, '0')}.png` })
  }
  await p.waitForTimeout(260)
}
const dips = samples.filter((s) => s.greens === 0)
console.log(`samples=${samples.length} minGreens=${minPaths} dipsToZero=${dips.length} layerAlways=${samples.every((s) => s.layer)}`)
console.log('first sample:', JSON.stringify(samples[0]))
console.log('last  sample:', JSON.stringify(samples[samples.length - 1]))

// geometry alignment at depth (same row-div compare as composite probe)
const geom = await p.evaluate(() => {
  const scroll = document.querySelector('[data-calendar-scroll]')
  const svg = scroll.querySelector('svg[aria-hidden="true"]')
  const wrapper = scroll.querySelector(':scope > div.relative')
  const rows = [...wrapper.children].filter((el) => el !== svg && el.matches('div'))
  const rowRects = rows.map((r) => { const b = r.getBoundingClientRect(); return { top: b.top, bot: b.bottom } })
  const rowMonths = rows.map((r) => {
    const s = new Set()
    for (const btn of r.querySelectorAll('button[aria-label]')) {
      const iso = btn.getAttribute('aria-label')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || (btn.className || '').includes('opacity-15')) continue
      s.add(iso.slice(0, 7))
    }
    return s
  })
  const errors = []
  let green = 0
  for (const path of svg.querySelectorAll('path')) {
    if (!/rgb\(0,\s*255,\s*0\)/.test(path.getAttribute('style') || '')) continue
    green++
    const bb = path.getBoundingClientRect()
    const cy = bb.top + bb.height / 2
    const wi = rowRects.findIndex((rr) => cy >= rr.top && cy <= rr.bot)
    if (wi < 0) { errors.push('no-row'); continue }
    const mk = [...rowMonths[wi]].find((k) => Number(k.slice(5)) % 2 === 0)
    if (!mk) { errors.push('no-even-month'); continue }
    const first = rowRects.findIndex((_, i) => rowMonths[i].has(mk))
    let last = -1
    rowRects.forEach((_, i) => { if (rowMonths[i].has(mk)) last = i })
    if (Math.abs(bb.top - rowRects[first].top) > 1.5) errors.push(`${mk} top ${Math.round(bb.top)} vs ${Math.round(rowRects[first].top)}`)
    if (Math.abs(bb.bottom - rowRects[last].bot) > 1.5) errors.push(`${mk} bot ${Math.round(bb.bottom)} vs ${Math.round(rowRects[last].bot)}`)
  }
  return { green, rows: rows.length, weeksInGrid: rowRects.length, scrollH: scroll.scrollHeight, errors: errors.slice(0, 6), errorCount: errors.length }
})
console.log('deep geom:', JSON.stringify(geom))

await p.close()
await b.close()
const ok = dips.length === 0 && minPaths > 0 && geom.errorCount === 0
console.log(ok ? 'DEEP-SCROLL PASS' : 'DEEP-SCROLL FAIL')
process.exit(ok ? 0 : 1)
