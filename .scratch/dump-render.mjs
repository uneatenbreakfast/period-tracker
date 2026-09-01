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

// Check what predictedDays and fertileDays look like
const state = await page.evaluate(() => {
  // Find all cells and check their classes and inner spans
  const cells = {}
  const dates = ['2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-29','2026-08-30','2026-08-31',
                 '2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05']
  for (const d of dates) {
    const el = document.querySelector(`button[aria-label="${d}"]`)
    if (!el) { cells[d] = 'not found'; continue }
    const inner = el.querySelector('span[aria-hidden]')
    const overlay = el.querySelector('.bg-rose-400')
    cells[d] = {
      bg: window.getComputedStyle(el).backgroundColor,
      cls: el.className.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('border-')).join(' '),
      hasRoseOverlay: !!overlay,
      overlayBg: overlay ? window.getComputedStyle(overlay).backgroundColor : null,
      innerHtml: el.innerHTML.substring(0, 200)
    }
  }
  return cells
})
console.log(JSON.stringify(state, null, 2))
await browser.close()
