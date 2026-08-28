import { chromium } from 'playwright'

const snapshot = {
  version: 1,
  entries: [
    { date: '2026-08-24', symptoms: [], flow: 'medium' },
    { date: '2026-08-25', symptoms: [], flow: 'heavy' },
    { date: '2026-08-26', symptoms: [], flow: 'heavy' },
    { date: '2026-08-27', symptoms: [], flow: 'medium' },
    { date: '2026-08-28', symptoms: [], flow: 'medium' },
    { date: '2026-08-29', symptoms: [], flow: 'light' },
    { date: '2026-08-30', symptoms: [], flow: 'light' },
    { date: '2026-08-31', symptoms: [], flow: 'spotting' },
    { date: '2026-09-01', symptoms: [], flow: 'spotting' },
    { date: '2026-09-02', symptoms: [], flow: 'spotting' },
    { date: '2026-09-03', symptoms: [], flow: 'spotting' },
    { date: '2026-09-04', symptoms: [], flow: 'spotting' },
  ],
  settings: {
    periodLength: 5,
    cycleLength: 28,
    lutealLength: 14,
    notificationsEnabled: false,
    notificationHour: 20,
    notificationMinute: 0,
    unitSystem: 'metric',
    locale: 'en-US',
  },
  updatedAt: '2026-08-28T19:35:00.000Z',
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:5190', { waitUntil: 'networkidle' })
await page.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', s), JSON.stringify(snapshot))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.screenshot({ path: '/mnt/c/temp/period-range-seeded.png', fullPage: false })
console.log('Screenshot saved')
await browser.close()
