// Verify anchored edit modal — REAL user flow:
// press flow day -> modal under row -> drag THROUGH modal to extend -> release
// -> scrolls while open + modal rides row -> Save persists.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5206/'
const pad = (n) => String(n).padStart(2, '0')
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

let failures = 0
const ok = (msg) => console.log('ok -', msg)
const fail = (msg) => { failures++; console.log('FAIL -', msg) }

async function run(tag, width, height) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  page.on('pageerror', (e) => fail(tag + ' pageerror: ' + e.message))

  const today = localISO(new Date())
  const mm = today.slice(0, 8)
  const d = (n) => `${mm}${pad(n)}`
  const seed = {
    version: 1,
    entries: [1, 2, 3, 4, 5].map((n) => ({ date: d(n), flow: 'medium', symptoms: [] })),
    settings: { cycleLength: 28, periodLength: 5, notifications: false },
    updatedAt: today,
  }

  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), seed)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForTimeout(900)

  const rect = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
  }, sel)
  const cellRect = async (iso) => {
    const b = await page.$(`button[aria-label="${iso}"]`)
    if (!b) return null
    const r = await b.boundingBox()
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
  }
  const scrollTop = () => page.evaluate(() => document.querySelector('[data-calendar-scroll]')?.scrollTop ?? -1)
  const storedRange = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1')).entries.map((e) => e.date).sort())
  const tap = (b) => ({ x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) })

  const c1 = await cellRect(d(1))
  const before = { cellY: c1.y, st: await scrollTop() }

  // 1) LONG PRESS day 1 (in run) — finger stays down.
  const p1 = tap(c1)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1] })
  await page.waitForTimeout(550)
  const armedModal = await rect('[data-edit-modal]')
  const armedCell = await cellRect(d(1))
  if (armedModal) {
    const cellBottom = armedCell.y + armedCell.h
    if (armedModal.y >= cellBottom - 2 && armedModal.y <= cellBottom + 40)
      ok(tag + ' modal under pressed row (modal.y=' + armedModal.y + ' cell.bottom=' + cellBottom.toFixed(1) + ')')
    else fail(tag + ' modal NOT under pressed row: ' + armedModal.y + ' vs ' + cellBottom)
    if (!(armedModal.y < cellBottom && armedModal.y + armedModal.h > armedCell.y))
      ok(tag + ' modal does not overlap the pressed cell')
    else fail(tag + ' modal overlaps the pressed cell!')
    if (armedCell.y === before.cellY) ok(tag + ' pressed cell did not move on modal open')
    else fail(tag + ' pressed cell MOVED: ' + before.cellY + ' -> ' + armedCell.y)
    if (armedModal.y + armedModal.h <= height) ok(tag + ' modal fully inside viewport')
    else fail(tag + ' modal bottom exceeds viewport')
  } else fail(tag + ' no modal after long press')

  // 2) Drag THROUGH the modal to day 7 — range must extend live (Sep 1-7).
  const c7 = await cellRect(d(7))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tap(c7)] })
  await page.waitForTimeout(250)
  const rangeText = await page.evaluate(() => document.querySelector('[data-edit-range]')?.textContent ?? '')
  if (/Sep 1 – Sep 7/.test(rangeText)) ok(tag + ' drag through modal extends range live: "' + rangeText + '"')
  else fail(tag + ' drag did not extend: "' + rangeText + '"')

  // 3) Release; pressed row must not move.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)
  const relCell = await cellRect(d(1))
  if (relCell && relCell.y === before.cellY) ok(tag + ' no vertical movement after release')
  else fail(tag + ' pressed row moved after release: ' + before.cellY + ' -> ' + (relCell && relCell.y))

  // 4) Calendar scrolls while modal open; modal rides with the row.
  const sc = await rect('[data-calendar-scroll]')
  const st0 = await scrollTop()
  const y0 = sc.y + sc.h - 40
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(sc.x + sc.w / 2), y: Math.round(y0) }] })
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(sc.x + sc.w / 2), y: Math.round(y0 - i * 50) }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(350)
  const st1 = await scrollTop()
  if (st1 - st0 > 40) ok(tag + ' calendar scrolls while modal open (' + st0 + ' -> ' + st1 + ')')
  else fail(tag + ' calendar frozen while modal open (' + st0 + ' -> ' + st1 + ')')
  const scrolledModal = await rect('[data-edit-modal]')
  const rowBottom = await page.evaluate(() => {
    const row = document.querySelector('[data-edit-modal]')?.parentElement
    return row ? row.getBoundingClientRect().bottom : null
  })
  if (scrolledModal && rowBottom !== null && Math.abs(scrolledModal.y - (rowBottom + 6)) <= 4)
    ok(tag + ' modal rides WITH the row (modal.y=' + scrolledModal.y + ' row.bottom=' + rowBottom.toFixed(1) + ')')
  else fail(tag + ' modal detached: modal.y=' + (scrolledModal && scrolledModal.y) + ' row.bottom=' + rowBottom)

  // 5) Save persists Sep 1-7.
  await page.click('button[aria-label="Save edit"]')
  await page.waitForTimeout(250)
  const entries = await storedRange()
  const expect7 = [1, 2, 3, 4, 5, 6, 7].map((n) => d(n)).sort()
  if (JSON.stringify(entries) === JSON.stringify(expect7)) ok(tag + ' Save persisted Sep 1-7')
  else fail(tag + ' Save persisted wrong range: ' + JSON.stringify(entries))

  await page.screenshot({ path: `/tmp/fix-${tag}-final.png` })
  await browser.close()
}

await run('large', 430, 932)
await run('small', 375, 667)
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)