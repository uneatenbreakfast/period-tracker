import { chromium } from 'playwright'

const seedData = {
  version: 1,
  entries: {
    '2026-08-24': { flow: 3 },
    '2026-08-25': { flow: 4 },
    '2026-08-26': { flow: 3 },
    '2026-08-27': { flow: 2 },
    '2026-08-28': { flow: 1 },
    '2026-08-29': { flow: 1 },
    '2026-08-30': { flow: 0 },
    '2026-08-31': { flow: 0 },
    '2026-09-01': { flow: 0 },
    '2026-09-02': { flow: 1 },
    '2026-09-03': { flow: 2 },
    '2026-09-04': { flow: 2 }
  },
  settings: { cycleLength: 28, periodLength: 5, notifications: false }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:5191')
await page.waitForLoadState('networkidle')
await page.evaluate((data) => {
  localStorage.setItem('bloom.snapshot.v1', JSON.stringify(data))
}, seedData)
await page.reload()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/period-range-verify.png' })
console.log('saved')
await browser.close()
