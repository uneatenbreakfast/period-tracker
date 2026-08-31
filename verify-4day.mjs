import { chromium } from 'playwright'

const seedData = {
  version: 1,
  entries: [
    { date: '2026-08-25', flow: 'medium', symptoms: [] },
    { date: '2026-08-26', flow: 'medium', symptoms: [] },
    { date: '2026-08-27', flow: 'medium', symptoms: [] },
    { date: '2026-08-28', flow: 'medium', symptoms: [] }
  ],
  settings: { cycleLength: 28, periodLength: 5 },
  updatedAt: '2026-08-31'
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto('http://localhost:5174')
await page.waitForLoadState('networkidle')
await page.evaluate((data) => {
  localStorage.setItem('bloom.snapshot.v1', JSON.stringify(data))
}, seedData)
await page.reload()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(800)

// Scroll Aug 2026 into view
await page.evaluate(() => {
  const scroller = document.querySelector('[data-calendar-scroll]')
  const el = document.querySelector('[data-month="2026-7"]')
  if (scroller && el) scroller.scrollTop = el.offsetTop - scroller.offsetTop
})
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/bloom-4day-range.png' })

// Dump cell info using aria-label selector
const cells = await page.evaluate(() => {
  const days = ['2026-08-24','2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-29']
  const result = {}
  for (const d of days) {
    const el = document.querySelector(`button[aria-label="${d}"]`)
    if (el) {
      const cs = window.getComputedStyle(el)
      const overlay = el.querySelector('.bg-rose-400')
      result[d] = {
        bg: cs.backgroundColor,
        cls: el.className,
        text: el.textContent?.trim(),
        hasRoseOverlay: !!overlay,
        overlayBg: overlay ? window.getComputedStyle(overlay).backgroundColor : null
      }
    } else {
      result[d] = 'not found'
    }
  }
  return result
})
console.log(JSON.stringify(cells, null, 2))

await browser.close()
