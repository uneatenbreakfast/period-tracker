import { chromium } from 'playwright'

const BASE = process.env.BLOOM_BASE_URL || 'http://127.0.0.1:5177/'
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

const today = new Date()
// Strip time; use local midnight via Date to avoid TZ drift on the seed keys
const localISO = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const snap = {
  version: 1,
  entries: [
    { date: localISO(today), flow: 'light', symptoms: [], notes: 'Cramps at noon' },
    { date: localISO(addDays(today, -2)), flow: 'medium', symptoms: [], notes: '' },
    { date: localISO(addDays(today, 2)), symptoms: [], notes: 'Felt tired' }, // no flow → unshaped cell, same row as today
  ],
  settings: { cycleLength: 28, periodLength: 5, showSafeDays: true },
  updatedAt: new Date().toISOString(),
}

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 })
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.goto(BASE)
await p.waitForTimeout(1200)
await p.evaluate((s) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)), snap)
await p.reload()
await p.waitForTimeout(2000)

const noteDay = localISO(today)               // flow + notes (shaped capsule)
const noteDayPlain = localISO(addDays(today, 2)) // notes, no flow (unshaped circle), same row
const controlDay = localISO(addDays(today, 1)) // clean, same row (unless month boundary)

const res = await p.evaluate(({ noteDay, noteDayPlain, controlDay }) => {
  const cell = (iso) => document.querySelector(`[data-calendar-scroll] button[aria-label="${iso}"]`)
  const numSpan = (el) => [...el.querySelectorAll('span')].find((s) => /^\d+$/.test(s.textContent.trim()))
  const n = cell(noteDay)
  const np = cell(noteDayPlain)
  const c = cell(controlDay)
  const get = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, centerY: r.top + r.height / 2, w: r.width, h: r.height }
  }
  const nSvgs = n ? [...n.querySelectorAll('svg[aria-hidden]')] : []
  const npSvgs = np ? [...np.querySelectorAll('svg[aria-hidden]')] : []
  return {
    noteCell: get(n),
    notePlainCell: get(np),
    controlCell: get(c),
    noteNum: get(numSpan(n)),
    notePlainNum: get(numSpan(np)),
    controlNum: get(numSpan(c)),
    noteSvgCount: nSvgs.length,
    noteSvgClass: nSvgs[0] ? nSvgs[0].getAttribute('class') : null,
    noteSvgPathD: nSvgs[0] ? nSvgs[0].querySelector('path')?.getAttribute('d') || '' : '',
    notePlainSvgCount: npSvgs.length,
    notePlainSvgClass: npSvgs[0] ? npSvgs[0].getAttribute('class') : null,
    controlSvgCount: c ? c.querySelectorAll('svg[aria-hidden]').length : -1,
  }
}, { noteDay, noteDayPlain, controlDay })

console.log(JSON.stringify(res, null, 2))

let fail = 0
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); if (!cond) fail++ }

ok(res.noteSvgCount === 1, `note day has exactly 1 svg icon (got ${res.noteSvgCount})`)
ok(res.notePlainSvgCount === 1, `plain note day has exactly 1 svg icon (got ${res.notePlainSvgCount})`)
ok(res.controlSvgCount === 0, `control day has 0 svg icons (got ${res.controlSvgCount})`)
ok(res.noteSvgPathD.startsWith('M19 3H4.99'), `icon path is post-it note (d starts M19 3H4.99)`)
ok(res.noteSvgClass && res.noteSvgClass.includes('absolute'), `icon is absolutely positioned (class=${res.noteSvgClass})`)
ok(res.noteSvgClass && res.noteSvgClass.includes('h-[10px]') && res.noteSvgClass.includes('w-[10px]'), `icon is 10px (class=${res.noteSvgClass})`)
ok(res.noteSvgClass && /\btext-white\b/.test(res.noteSvgClass) && !res.noteSvgClass.includes('text-white/'), `shaped-day icon is full white for contrast on rose (class=${res.noteSvgClass})`)
ok(res.notePlainSvgClass && res.notePlainSvgClass.includes('text-ink/70'), `plain-day icon is ink/70 for contrast on cream (class=${res.notePlainSvgClass})`)
const dY = res.notePlainNum && res.controlNum ? Math.abs(res.notePlainNum.centerY - res.controlNum.centerY) : -1
ok(dY >= 0 && dY <= 1, `unshaped note-day number Y center identical to clean control (Δ=${dY}px)`)
const cY = res.noteCell && res.noteNum ? Math.abs(res.noteCell.centerY - res.noteNum.centerY) : -1
ok(cY >= 0 && cY <= 1, `flow+note day number centered in capsule cell (Δ=${cY}px)`)

await p.screenshot({ path: '/tmp/postit-verify.png', fullPage: false })
console.log('pageerrors:', errs.length ? errs.join(' | ') : 'none')
await b.close()
process.exit(fail > 0 ? 1 : 0)