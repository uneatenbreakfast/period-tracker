import { chromium } from 'playwright'

const seedData = {
  version: 1,
  entries: [
    { date: '2026-08-25', flow: 'medium', symptoms: [], notes: '' },
    { date: '2026-08-26', flow: 'medium', symptoms: [], notes: '' },
    { date: '2026-08-27', flow: 'light', symptoms: [], notes: '' },
    { date: '2026-08-28', flow: 'light', symptoms: [], notes: '' }
  ],
  settings: { cycleLength: 28, periodLength: 5 },
  updatedAt: '2026-09-01'
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:5173/')
await page.waitForLoadState('networkidle')

await page.evaluate((data) => {
  localStorage.setItem('bloom.snapshot.v1', JSON.stringify(data))
}, seedData)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)

await page.screenshot({ path: 'bloom-4day-range.png', fullPage: false })
console.log('captured bloom-4day-range.png')

await browser.close()
