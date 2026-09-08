// Coverage-based tint probe (pixel truth): for each tinted SVG path, sample
// the CENTER of every day cell per month via Canvas2D isPointInPath.
// Correct = every even month's cells covered by exactly its one band (100%),
// odd months covered 0%, no cell covered by 2 bands.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5280/';
const SAVE = JSON.parse(fs.readFileSync('/tmp/bloom-backup-2026-09-08__1_.json', 'utf8'));
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1440];

const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });

async function stableMeasure(page) {
  let prev = '';
  for (let i = 0; i < 60; i++) {
    const sig = await page.evaluate(() => {
      const svg = document.querySelector('[data-calendar-scroll] > div.relative svg');
      if (!svg) return 'NOSVG';
      const paths = [...svg.querySelectorAll('path')];
      return `${svg.getAttribute('viewBox')}|${paths.length}`;
    });
    if (sig !== 'NOSVG' && sig === prev) return sig;
    prev = sig;
    await page.waitForTimeout(120);
  }
  return prev;
}

// In-page: per tinted path, count covered day-cell centers per month.
// Also returns band bboxes + month unions (for informational bottom deltas).
async function measure(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('[data-calendar-scroll]');
    const wrapper = scroll.querySelector(':scope > div.relative');
    const svg = wrapper.querySelector('svg');
    if (!svg) return { err: 'no svg' };
    const sRect = svg.getBoundingClientRect();
    const paths = [...svg.querySelectorAll('path')];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const path2d = paths.map((p) => new Path2D(p.getAttribute('d')));
    // Collect day cells grouped by month, coords in SVG user space (== CSS px)
    const months = new Map();
    for (const btn of scroll.querySelectorAll('button[aria-label]')) {
      const m = (btn.getAttribute('aria-label') || '').match(/^(\d{4}-\d{2})-\d{2}$/);
      if (!m) continue;
      const r = btn.getBoundingClientRect();
      const cell = { x: r.left - sRect.left, y: r.top - sRect.top, w: r.width, h: r.height };
      let rec = months.get(m[1]);
      if (!rec) { rec = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, n: 0, cells: [] }; months.set(m[1], rec); }
      rec.minX = Math.min(rec.minX, cell.x);
      rec.maxX = Math.max(rec.maxX, cell.x + cell.w);
      rec.minY = Math.min(rec.minY, cell.y);
      rec.maxY = Math.max(rec.maxY, cell.y + cell.h);
      rec.n++;
      rec.cells.push(cell);
    }
    // Coverage: path -> { monthKey: {covered, total} }
    const coverage = paths.map((p, pi) => {
      const out = { fill: (p.getAttribute('style') || p.getAttribute('fill') || '').trim(), per: {} };
      for (const [ym, rec] of months) {
        let covered = 0;
        for (const c of rec.cells) {
          const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
          if (ctx.isPointInPath(path2d[pi], cx, cy)) covered++;
        }
        if (covered > 0) out.per[ym] = { covered, total: rec.n };
      }
      return out;
    });
    return {
      svgW: sRect.width, svgH: sRect.height, vb: svg.getAttribute('viewBox'),
      scrollTop: scroll.scrollTop, months: [...months.entries()].map(([ym, rec]) => ({ ym, ...rec, cells: undefined })),
      coverage,
    };
  });
}

function mKey(ym) { return Number(ym.slice(5, 7)) % 2 === 0; }

function check(m) {
  const errs = [];
  const bandFor = new Set();
  // each path must cover exactly one even month, fully; odd months uncovered
  for (const c of m.coverage) {
    const keys = Object.keys(c.per);
    if (keys.length === 0) { errs.push('path covers NO month cells'); continue; }
    if (keys.length > 1) { errs.push(`path covers ${keys.join(',')} (multi-month)`); continue; }
    const ym = keys[0];
    if (!mKey(ym)) { errs.push(`band on ODD month ${ym} (${c.per[ym].covered}/${c.per[ym].total})`); continue; }
    const { covered, total } = c.per[ym];
    if (covered !== total) errs.push(`${ym}: band covers ${covered}/${total} cells`);
    bandFor.add(ym);
  }
  // every even month in view has a band (skip FIRST button-month = leading
  // Monday-padding week; continuousGrid pads the strip before the first
  // in-window month, so those days are legitimately untinted)
  const keys = m.months.map((x) => x.ym);
  for (const { ym } of m.months) {
    if (ym === keys[0]) continue; // leading padding (pre-first-month week)
    if (ym === keys[keys.length - 1]) continue; // trailing padding
    if (mKey(ym) && !bandFor.has(ym)) errs.push(`MISSING band for even month ${ym}`);
  }
  const midKeys = keys.slice(1, -1);
  if (m.coverage.length !== midKeys.filter((x) => mKey(x)).length) {
    errs.push(`path count ${m.coverage.length} != even months ${midKeys.filter((x) => mKey(x)).length}`);
  }
  return { errs, svgW: m.svgW, months: m.months.length, bands: m.coverage.length, weeks: m.weeks, scrollTop: m.scrollTop, vb: m.vb };
}

const results = [];

// --- Width sweep (fresh page each) ---
for (const w of WIDTHS) {
  const p = await b.newPage({ viewport: { width: w, height: 932 } });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)); }, SAVE);
  await p.reload({ waitUntil: 'networkidle0' });
  await stableMeasure(p);
  const m = await measure(p);
  const chk = check(m);
  results.push({ step: `fresh-${w}`, ...chk });
  for (const e of chk.errs) console.log(`[${w}] ERR ${e}`);
  console.log(`fresh ${w}: svgW=${m.svgW} bands=${m.coverage.length} months=${m.months.length} errs=${chk.errs.length}`);
  await p.close();
}

// --- Live resize same page ---
{
  const p = await b.newPage({ viewport: { width: 375, height: 932 } });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)); }, SAVE);
  await p.reload({ waitUntil: 'networkidle0' });
  await stableMeasure(p);
  for (const w of [768, 320, 1024]) {
    await p.setViewportSize({ width: w, height: 932 });
    await stableMeasure(p);
    const m = await measure(p);
    const chk = check(m);
    results.push({ step: `resize->${w}`, ...chk });
    for (const e of chk.errs) console.log(`[resize->${w}] ERR ${e}`);
    console.log(`resize ->${w}: svgW=${m.svgW} bands=${m.coverage.length} months=${m.months.length} errs=${chk.errs.length}`);
  }
  await p.close();
}

// --- Prepend/back-scroll at 390 ---
{
  const p = await b.newPage({ viewport: { width: 390, height: 932 } });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('bloom.snapshot.v1', JSON.stringify(s)); }, SAVE);
  await p.reload({ waitUntil: 'networkidle0' });
  await stableMeasure(p);
  for (let step = 1; step <= 3; step++) {
    await p.evaluate(() => { document.querySelector('[data-calendar-scroll]').scrollTop = 0; });
    await p.waitForTimeout(900);
    await stableMeasure(p);
    const m = await measure(p);
    const chk = check(m);
    results.push({ step: `prepend#${step}@390`, ...chk });
    for (const e of chk.errs) console.log(`[prepend#${step}@390] ERR ${e}`);
    console.log(`prepend#${step}@390: bands=${m.coverage.length} months=${m.months.length} errs=${chk.errs.length}`);
  }
  await p.close();
}

console.log('=== SUMMARY ===');
let total = 0;
for (const r of results) { total += r.errs.length; console.log(`${r.step}: ${r.errs.length ? r.errs.join(' | ') : 'OK'} (svgW=${r.svgW})`); }
console.log(`TOTAL ERRORS: ${total}`);
await b.close();