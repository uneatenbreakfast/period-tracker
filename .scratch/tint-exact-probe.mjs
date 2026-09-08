// Exact tint-geometry probe: for every month path, compare bbox to the month's
// real cell extents (derived from button aria-labels). Drives deep back-scroll.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5198/';
const SAVE = JSON.parse(fs.readFileSync('/tmp/bloom-backup-2026-09-08.json', 'utf8'));
const even = (m1) => m1 % 2 === 0;

async function probe(page) {
  const g = await page.evaluate(() => {
    const tb = document.querySelector('[data-calendar-scroll] > div.relative');
    const tbr = tb.getBoundingClientRect();
    const svg = tb.querySelector('svg');
    // per-month cell extents from button aria-labels (exact ISO dates)
    const months = new Map();
    for (const b of tb.querySelectorAll('button[aria-label]')) {
      const iso = b.getAttribute('aria-label');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
      if ((b.className || '').includes('opacity-15')) continue // pad cell
      const r = b.getBoundingClientRect();
      const top = r.top - tbr.top, bot = r.top + r.height - tbr.top;
      const mk = iso.slice(0, 7);
      let m = months.get(mk);
      if (!m) { m = { top: Infinity, bot: -Infinity, rows: 0 }; months.set(mk, m); }
      m.top = Math.min(m.top, top); m.bot = Math.max(m.bot, bot);
    }
    // snap month bottoms to the LAST ROW containing an in-month cell (rows are
    // taller than the 44px buttons; the tint band fills the whole row)
    const rowBots = [...tb.querySelectorAll('div.grid.grid-cols-7')].map((r) => {
      const rr = r.getBoundingClientRect();
      return { top: rr.top - tbr.top, bot: rr.top - tbr.top + rr.height };
    });
    for (const m of months.values()) {
      // deepest row whose TOP is at/below the last button → that row's bottom
      const lastRow = [...rowBots].sort((a, b) => b.top - a.top).find((r) => r.top <= m.bot - 1);
      if (lastRow) m.bot = lastRow.bot;
    }
    const rows = [...tb.querySelectorAll('div.grid')].length;
    const scroll = document.querySelector('[data-calendar-scroll]');
    const paths = [...svg.querySelectorAll('path')].map((p) => {
      const bb = p.getBBox();
      return { y: bb.y, h: bb.height, x: bb.x, w: bb.width };
    }).sort((a, b) => a.y - b.y);
    return {
      months: [...months.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => a.k < b.k ? -1 : 1),
      rows, paths, scrollTop: scroll.scrollTop, scrollH: scroll.scrollHeight,
      vb: svg.getAttribute('viewBox'),
      monthCount: months.size,
    };
  });
  // verify: every path must sit exactly on an EVEN month's cell extents
  const errors = [];
  const byMonth = new Map(g.months.map((m) => [m.k, m]));
  let prevBot = -1e9;
  for (const p of g.paths) {
    // find month whose extents start at p.y (within 0.6)
    const cands = g.months.filter((m) => Math.abs(m.top - p.y) < 0.6);
    if (cands.length === 0) { errors.push(`path@y${p.y.toFixed(1)} matches NO month top`); continue; }
    for (const c of cands) {
      const m1 = Number(c.k.slice(5, 7));
      if (!even(m1)) errors.push(`path@y${p.y.toFixed(1)} on ODD month ${c.k}`);
      if (Math.abs(c.bot - (p.y + p.h)) > 0.7) errors.push(`path@y${p.y.toFixed(1)} ${c.k} bot ${(p.y + p.h).toFixed(1)} != month bot ${c.bot.toFixed(1)} (Δ ${((p.y + p.h) - c.bot).toFixed(1)})`);
      if (Math.abs(c.top - p.y) > 0.1) errors.push(`path@y${p.y.toFixed(1)} ${c.k} top matches but Δ ${(p.y - c.top).toFixed(1)}`);
    }
    prevBot = p.y + p.h;
  }
  // every even month must have a path
  for (const m of g.months) {
    const m1 = Number(m.k.slice(5, 7));
    if (!even(m1)) continue;
    if (!g.paths.some((p) => Math.abs(p.y - m.top) < 0.6))
      errors.push(`EVEN month ${m.k} (top ${m.top.toFixed(1)}) has NO path`);
  }
  // every path must be px-space: width ~7 cells (≈358) or partial month width
  for (const p of g.paths) {
    if (p.w < 80) errors.push(`path@y${p.y.toFixed(1)} width ${p.w.toFixed(1)} — suspicious (unit space?)`);
  }
  console.log(`months=${g.monthCount} rows=${g.rows} paths=${g.paths.length} vb=${g.vb} scrollTop=${g.scrollTop} ERRORS: ${errors.length ? errors.slice(0, 8).join(' | ') : 'NONE'}`);
  return { errors, g };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((snap) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(snap)), SAVE);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(900);

  console.log('— initial —');
  let r = await probe(page);
  await page.screenshot({ path: '/tmp/probe-initial.png' });

  // deep back-scroll to 2012-02 (dm "2012-1")
  const targetKey = '2012-02';
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => { const s = document.querySelector('[data-calendar-scroll]'); s.scrollTop = 0; });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const tb = document.querySelector('[data-calendar-scroll] > div.relative');
      const first = [...tb.querySelectorAll('button[aria-label]')].sort((a, b) => a.getAttribute('aria-label') < b.getAttribute('aria-label') ? -1 : 1)[0];
      return first?.getAttribute('aria-label') || null;
    });
    console.log(`— back#${i + 1} first=${m} —`);
    r = await probe(page);
    if (m && m.slice(0, 7) <= targetKey) { console.log('reached 2012'); await page.screenshot({ path: '/tmp/probe-2012.png' }); break; }
    if (r.errors.length) { await page.screenshot({ path: `/tmp/probe-back-${i + 1}.png` }); }
  }
  // pixel scan the deep-history + initial + today screenshots
  await page.evaluate(() => { const s = document.querySelector('[data-calendar-scroll]'); s.scrollTop = s.scrollHeight * 0.75; });
  await page.waitForTimeout(500);
  console.log('— mid-history —');
  await probe(page);
  await page.screenshot({ path: '/tmp/probe-mid.png' });

  await browser.close();
  console.log('DONE');
})();