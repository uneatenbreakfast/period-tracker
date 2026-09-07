// Seed a note on today + take a screenshot proving the note symbol renders.
const { chromium } = require('playwright');
const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5174/';
const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoAdd = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  const today = localISO(new Date());
  const withNote1 = isoAdd(today, -2);
  const withNote2 = isoAdd(today, 3);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(({ today, withNote1, withNote2 }) => {
    localStorage.setItem('bloom.snapshot.v1', JSON.stringify({
      version: 1,
      entries: [
        // period day WITH note → white icon on rose strip
        { date: withNote1, flow: 'medium', symptoms: [], notes: 'Heavy day, took ibuprofen' },
        // plain day WITH note → ink icon on white cell
        { date: withNote2, flow: undefined, symptoms: [], notes: 'Bloating in evening' },
        // today, no note — control
        { date: today, flow: 'light', symptoms: [], notes: '' }
      ],
      updatedAt: new Date().toISOString()
    }));
  }, { today, withNote1, withNote2 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(700);
  const probe = await page.evaluate(({ today, withNote1, withNote2 }) => {
    const cell = (iso) => document.querySelector(`[data-calendar-scroll] button[aria-label="${iso}"]`);
    const q = (el) => el ? { icons: el.querySelectorAll('svg[aria-hidden]').length, cls: el.className } : null;
    return {
      notePeriod: q(cell(withNote1)),
      notePlain: q(cell(withNote2)),
      noNote: q(cell(today)),
    };
  }, { today, withNote1, withNote2 });
  console.log(JSON.stringify(probe, null, 2));
  await page.screenshot({ path: '/tmp/note-symbol.png', fullPage: false });
  await browser.close();
})();