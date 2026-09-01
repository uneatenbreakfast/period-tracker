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

// Check what element is at the center of a known cell position
const cellCheck = await page.evaluate(() => {
  // Aug 25 should be at roughly x=103, y=176 (CSS coords from the rect data)
  const testPoints = [
    { name: 'Aug25_center', x: 103, y: 176 },
    { name: 'Sep5_center', x: 286, y: 221 },
  ]
  
  const result = {}
  for (const pt of testPoints) {
    const el = document.elementFromPoint(pt.x, pt.y)
    if (el) {
      const cs = window.getComputedStyle(el)
      result[pt.name] = {
        tag: el.tagName,
        class: el.className?.substring?.(0, 200),
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        content: el.textContent?.substring(0, 30),
        rect: el.getBoundingClientRect() ? {
          x: Math.round(el.getBoundingClientRect().x),
          y: Math.round(el.getBoundingClientRect().y),
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
        } : null
      }
    }
  }
  
  // Also check the entire DOM tree for any element with bg-rose-400 that could be overlapping
  const roseElements = []
  const allEls = document.querySelectorAll('*')
  for (const el of allEls) {
    const cs = window.getComputedStyle(el)
    if (cs.backgroundColor === 'rgb(229, 138, 168)' && el.tagName !== 'BUTTON') {
      const rect = el.getBoundingClientRect()
      roseElements.push({
        tag: el.tagName,
        class: el.className?.substring?.(0, 100),
        bg: cs.backgroundColor,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        zIndex: cs.zIndex,
        position: cs.position,
      })
    }
  }
  
  return { elementAtPoint: result, roseOverlays: roseElements }
})
console.log(JSON.stringify(cellCheck, null, 2))
await browser.close()
