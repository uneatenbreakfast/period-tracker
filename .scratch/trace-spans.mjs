import { chromium } from 'playwright'
const backup = {"version":1,"entries":[{"date":"2012-02-14","symptoms":[],"flow":"medium"},{"date":"2012-02-15","symptoms":[],"flow":"medium"},{"date":"2012-02-16","symptoms":[],"flow":"medium"},{"date":"2012-02-17","symptoms":[],"flow":"medium"},{"date":"2012-02-18","symptoms":[],"flow":"medium"},{"date":"2026-06-17","symptoms":[],"flow":"medium"},{"date":"2026-06-18","symptoms":[],"flow":"medium"},{"date":"2026-08-04","symptoms":["headache"]},{"date":"2026-08-12","symptoms":["mood"]},{"date":"2026-09-18","symptoms":["nausea"]},{"date":"2026-12-23","symptoms":[],"flow":"medium"},{"date":"2026-12-24","symptoms":[],"flow":"medium"},{"date":"2026-12-25","symptoms":[],"flow":"medium"},{"date":"2026-12-26","symptoms":[],"flow":"medium"},{"date":"2026-12-27","symptoms":[],"flow":"medium"},{"date":"2026-12-28","symptoms":[],"flow":"medium"},{"date":"2026-12-29","symptoms":[],"flow":"medium"},{"date":"2026-12-30","symptoms":[],"flow":"medium"},{"date":"2027-01-03","symptoms":[],"flow":"medium"},{"date":"2027-01-04","symptoms":[],"flow":"medium"}],"settings":{"cycleLength":28,"periodLength":5},"updatedAt":"2026-09-01"}
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:4174')
await page.waitForLoadState('networkidle')
await page.evaluate((data) => {
  localStorage.setItem('bloom.snapshot.v1', JSON.stringify(data))
}, backup)
await page.reload()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(2000)

const trace = await page.evaluate(() => {
  // Find all spans with bg-rose-400
  const roseSpans = document.querySelectorAll('span.bg-rose-400')
  const results = []
  for (const span of roseSpans) {
    const rect = span.getBoundingClientRect()
    if (rect.width > 50) { // Only the big ones covering the grid
      // Walk up the DOM tree
      const ancestry = []
      let el = span
      for (let i = 0; i < 10 && el; i++) {
        const cs = window.getComputedStyle(el)
        ancestry.push({
          tag: el.tagName,
          class: el.className?.substring?.(0, 120) || '',
          position: cs.position,
          rect: { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) },
        })
        el = el.parentElement
      }
      results.push({
        spanRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        spanClass: span.className,
        ancestry
      })
    }
  }
  return results
})
console.log(JSON.stringify(trace, null, 2))
await browser.close()
