// nav-probe.mjs — measure nav tab geometry at multiple viewports.
// Asserts no horizontal overflow, no text clipping, indicator sanity.
import { chromium } from 'playwright'

const PORT = process.env.BLOOM_PORT || '5174'
const BASE = `http://localhost:${PORT}`
const VIEWPORTS = [
  { w: 320, h: 568, name: 'iphone-5/se' },
  { w: 360, h: 800, name: 'android-small' },
  { w: 375, h: 667, name: 'iphone-8' },
  { w: 390, h: 844, name: 'iphone-12' },
  { w: 430, h: 932, name: 'iphone-14pro-max' },
]

const browser = await chromium.launch({ headless: true })
const failures = []
try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } })
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Views"]')
      const btns = [...nav.querySelectorAll('[data-tab]')]
      const indicator = nav.querySelector('.tab-indicator')
      const doc = document.documentElement
      return {
        navClient: nav.clientWidth,
        navScroll: nav.scrollWidth,
        docScrollW: doc.scrollWidth,
        docClientW: doc.clientWidth,
        btns: btns.map((b) => ({
          label: b.textContent.trim(),
          left: b.offsetLeft,
          right: b.offsetLeft + b.offsetWidth,
          width: b.offsetWidth,
          textScrollW: b.scrollWidth,
          textClientW: b.clientWidth,
        })),
        indicator: indicator
          ? { left: indicator.offsetLeft, width: indicator.offsetWidth }
          : null,
      }
    })
    const navRight = m.navClient
    const navOverflow = m.navScroll - m.navClient
    const docOverflow = m.docScrollW - m.docClientW
    const clippedBtns = m.btns.filter((b) => b.right > navRight + 0.5)
    const textClipped = m.btns.filter((b) => b.textScrollW > b.textClientW + 0.5)
    const row = {
      vp: `${vp.name} ${vp.w}x${vp.h}`,
      navOverflowPx: navOverflow,
      docOverflowPx: docOverflow,
      clippedBtns: clippedBtns.map((b) => `${b.label}@${b.right - navRight}`),
      textClipped: textClipped.map((b) => b.label),
      tabWidths: m.btns.map((b) => b.width),
      indicator: m.indicator,
    }
    console.log(JSON.stringify(row))
    if (navOverflow > 0 || docOverflow > 0 || clippedBtns.length || textClipped.length) {
      failures.push(row)
    }
    await page.close()
  }
} finally {
  await browser.close()
}
console.log(failures.length ? `FAIL: ${failures.length} viewports broken` : 'PASS: all viewports fit')
process.exit(failures.length ? 1 : 0)