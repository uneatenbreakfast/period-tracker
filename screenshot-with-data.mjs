import { chromium } from 'playwright'

const snap = {
  version: 1,
  updatedAt: '2026-09-05',
  settings: { cycleLength: 28, periodLength: 5 },
  entries: [
    { date: '2026-08-08', flow: 'medium', symptoms: [] },
    { date: '2026-08-09', flow: 'heavy', symptoms: [] },
    { date: '2026-08-10', flow: 'heavy', symptoms: [] },
    { date: '2026-08-11', flow: 'medium', symptoms: [] },
    { date: '2026-08-12', flow: 'light', symptoms: [] },
  ],
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } })
const page = await ctx.newPage()

await page.addInitScript((data) => {
  window.localStorage.setItem('bloom.snapshot.v1', data)
}, JSON.stringify(snap))

await page.goto('http://localhost:5190')
await page.waitForTimeout(5000)
await page.screenshot({ path: '/mnt/c/Users/Nelson/Desktop/bloom-changes.png' })
await browser.close()
console.log('done')
