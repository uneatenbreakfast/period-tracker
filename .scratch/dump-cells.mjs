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

// Dump a sample of cells across different months
const cells = await page.evaluate(() => {
  const samples = [
    '2026-08-25', '2026-08-28', '2026-08-31',
    '2026-09-01', '2026-09-05', '2026-09-15',
    '2026-10-01', '2026-10-15',
    '2026-11-01', '2026-11-15',
    '2026-12-23', '2026-12-28',
  ]
  const result = {}
  for (const d of samples) {
    const el = document.querySelector(`button[aria-label="${d}"]`)
    if (el) {
      const cs = window.getComputedStyle(el)
      const monthNum = parseInt(d.split('-')[1])
      result[d] = {
        monthNum,
        isEvenMonth: monthNum % 2 === 0,
        bg: cs.backgroundColor,
        classes: el.className,
        hasMonthTint: el.className.includes('bg-month-tint'),
        hasRose: el.className.includes('bg-rose'),
      }
    } else {
      result[d] = 'not found'
    }
  }
  return result
})
console.log(JSON.stringify(cells, null, 2))
await browser.close()
