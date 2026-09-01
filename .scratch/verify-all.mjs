import { chromium } from 'playwright'
const backup = {"version":1,"entries":[{"date":"2012-02-14","symptoms":[],"flow":"medium"},{"date":"2012-02-15","symptoms":[],"flow":"medium"},{"date":"2012-02-16","symptoms":[],"flow":"medium"},{"date":"2012-02-17","symptoms":[],"flow":"medium"},{"date":"2012-02-18","symptoms":[],"flow":"medium"},{"date":"2026-06-17","symptoms":[],"flow":"medium"},{"date":"2026-06-18","symptoms":[],"flow":"medium"},{"date":"2026-08-04","symptoms":["headache"]},{"date":"2026-08-12","symptoms":["mood"]},{"date":"2026-09-18","symptoms":["nausea"]},{"date":"2026-12-23","symptoms":[],"flow":"medium"},{"date":"2026-12-24","symptoms":[],"flow":"medium"},{"date":"2026-12-25","symptoms":[],"flow":"medium"},{"date":"2026-12-26","symptoms":[],"flow":"medium"},{"date":"2026-12-27","symptoms":[],"flow":"medium"},{"date":"2026-12-28","symptoms":[],"flow":"medium"},{"date":"2026-12-29","symptoms":[],"flow":"medium"},{"date":"2026-12-30","symptoms":[],"flow":"medium"},{"date":"2027-01-03","symptoms":[],"flow":"medium"},{"date":"2027-01-04","symptoms":[],"flow":"medium"}],"settings":{"cycleLength":28,"periodLength":5},"updatedAt":"2026-09-01"}
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:4174')
await page.waitForLoadState('networkidle')
await page.evaluate((data) => {
  localStorage.setItem('bloom.snapshot.v1', JSON.stringify(data))
}, backup)
await page.reload()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(2000)

// Get bounding boxes of specific cells
const cells = await page.evaluate(() => {
  const dates = ['2026-08-25','2026-08-28','2026-09-01','2026-09-05','2026-10-01','2026-10-15']
  const result = {}
  for (const d of dates) {
    const el = document.querySelector(`button[aria-label="${d}"]`)
    if (el) {
      const rect = el.getBoundingClientRect()
      const cs = window.getComputedStyle(el)
      result[d] = {
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        boxShadow: cs.boxShadow,
        border: cs.border,
        outline: cs.outline,
        cls: el.className.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('border-') || c.startsWith('shadow-')).join(' ')
      }
    }
  }
  
  // Also check the calendar card container
  const card = document.querySelector('.rounded-3xl')
  if (card) {
    const cs = window.getComputedStyle(card)
    result._card = {
      bg: cs.backgroundColor,
      boxShadow: cs.boxShadow,
      cls: card.className.split(' ').filter(c => c.startsWith('bg-')).join(' ')
    }
  }
  
  // Check body
  result._body = {
    bg: window.getComputedStyle(document.body).backgroundColor
  }
  
  return result
})
console.log(JSON.stringify(cells, null, 2))

await page.screenshot({ path: '.scratch/bloom-verify-hires.png', fullPage: false })
console.log('Screenshot saved at 2x')
await browser.close()
