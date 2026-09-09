// Settings safe-days toggle geometry probe: does the knob / pill escape its containers?
import { chromium } from 'playwright'

const port = process.argv[2] || '5195'
const BASE = `http://localhost:${port}/`
const out = process.argv[3] || '/tmp/toggle-probe.png'

const snap = {
  version: 1,
  entries: [],
  settings: { cycleLength: 28, periodLength: 5, showSafeDays: true },
  updatedAt: new Date().toISOString(),
}

const b = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const p = await b.newPage({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
})

async function measure(tag) {
  return await p.evaluate((label) => {
    const row = document.querySelector('[data-testid="settings-show-safe-days"]')
    const pill = document.querySelector('[data-testid="settings-show-safe-days-toggle"]')
    if (!row || !pill) return { tag: label, error: 'missing' }
    const knob = pill.querySelector('span')
    const r = (el) => {
      const x = el.getBoundingClientRect()
      return { l: +x.left.toFixed(2), t: +x.top.toFixed(2), r: +x.right.toFixed(2), b: +x.bottom.toFixed(2), w: +x.width.toFixed(2), h: +x.height.toFixed(2) }
    }
    const rowR = r(row)
    const pillR = r(pill)
    const knobR = r(knob)
    const pillInRow = {
      dxL: +(pillR.l - rowR.l).toFixed(2),
      dxR: +(rowR.r - pillR.r).toFixed(2),
      dyT: +(pillR.t - rowR.t).toFixed(2),
      dyB: +(rowR.b - pillR.b).toFixed(2),
    }
    const knobInPill = {
      dxL: +(knobR.l - pillR.l).toFixed(2),
      dxR: +(pillR.r - knobR.r).toFixed(2),
      dyT: +(knobR.t - pillR.t).toFixed(2),
      dyB: +(pillR.b - knobR.b).toFixed(2),
    }
    const cs = getComputedStyle(pill)
    const overflow = getComputedStyle(row).overflow
    const knobTransform = getComputedStyle(knob).transform
    return {
      tag: label,
      pillInRow,
      knobInPill,
      pillOverflowCSS: cs.overflow,
      rowOverflowCSS: overflow,
      knobTransform,
      knobPos: { top: getComputedStyle(knob).top, left: getComputedStyle(knob).left },
    }
  }, tag)
}

// go to settings tab
await p.goto(BASE)
await p.waitForTimeout(1200)
await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
await p.reload()
await p.waitForTimeout(1500)
await p.click('[data-tab="settings"]')
await p.waitForTimeout(900)

console.log('ON :', JSON.stringify(await measure('ON'), null, 1))
// toggle off and re-measure
await p.click('[data-testid="settings-show-safe-days-toggle"]')
await p.waitForTimeout(600)
console.log('OFF:', JSON.stringify(await measure('OFF'), null, 1))

// full settings page shot (toggle ON again)
await p.click('[data-testid="settings-show-safe-days-toggle"]')
await p.waitForTimeout(700)
await p.screenshot({ path: out, fullPage: true })
console.log('saved', out)

// re-run at 150% root font (Android a11y font scale equivalent)
await p.evaluate(() => { document.documentElement.style.fontSize = '24px' })
await p.reload()
await p.waitForTimeout(1500)
await p.click('[data-tab="settings"]')
await p.waitForTimeout(900)
console.log('ON@150%:', JSON.stringify(await measure('ON@150%'), null, 1))
await p.evaluate(() => { document.documentElement.style.fontSize = '32px' })
await p.waitForTimeout(600)
console.log('ON@200%:', JSON.stringify(await measure('ON@200%'), null, 1))

await b.close()
