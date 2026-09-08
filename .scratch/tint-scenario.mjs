import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5198/';
const SAVE = JSON.parse(fs.readFileSync('/tmp/bloom-backup-2026-09-08.json', 'utf8'));
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((snap) => localStorage.setItem('bloom.snapshot.v1', JSON.stringify(snap)), SAVE);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(900);
  // interleave bottom-grow (growFuture) and top-prepend rapidly
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { const s = document.querySelector('[data-calendar-scroll]'); s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const s = document.querySelector('[data-calendar-scroll]'); s.scrollTop = 0; });
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const tb = document.querySelector('[data-calendar-scroll] > div.relative');
    const tbr = tb.getBoundingClientRect();
    const svg = tb.querySelector('svg');
    const months = new Map();
    for (const b of tb.querySelectorAll('button[aria-label]')) {
      const iso = b.getAttribute('aria-label');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
      if ((b.className || '').includes('opacity-15')) continue;
      const r2 = b.getBoundingClientRect();
      const mk = iso.slice(0, 7);
      let m = months.get(mk);
      if (!m) { m = { top: Infinity, bot: -Infinity }; months.set(mk, m); }
      m.top = Math.min(m.top, r2.top - tbr.top);
      m.bot = Math.max(m.bot, r2.top + r2.height - tbr.top);
    }
    const rowBots = [...tb.querySelectorAll('div.grid.grid-cols-7')].map((r2) => {
      const rr = r2.getBoundingClientRect();
      return { top: rr.top - tbr.top, bot: rr.top - tbr.top + rr.height };
    });
    for (const m of months.values()) {
      const lastRow = [...rowBots].sort((a, b) => b.top - a.top).find((r2) => r2.top <= m.bot - 1);
      if (lastRow) m.bot = lastRow.bot;
    }
    const paths = [...svg.querySelectorAll('path')].map((p) => p.getBBox()).sort((a, b) => a.y - b.y);
    const errs = [];
    const even = [...months.entries()].filter(([mk]) => Number(mk.slice(5, 7)) % 2 === 0);
    let evenCount = 0;
    for (const [mk, m] of even) {
      evenCount++;
      const p = paths.find((p) => Math.abs(p.y - m.top) < 0.6);
      if (!p) errs.push(`${mk}:NO_PATH@${m.top.toFixed(1)}`);
      else if (Math.abs(p.y + p.height - m.bot) > 0.8) errs.push(`${mk}:BOT ${(p.y + p.height).toFixed(1)} vs ${m.bot.toFixed(1)}`);
    }
    if (paths.length !== evenCount) errs.push(`pathCount ${paths.length} vs evenMonths ${evenCount}`);
    return { months: months.size, evenCount, pathCount: paths.length, errs, vb: svg.getAttribute('viewBox') };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();