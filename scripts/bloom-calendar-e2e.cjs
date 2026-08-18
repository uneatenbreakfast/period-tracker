// Bloom scrollable calendar E2E — months list, initial scroll to today,
// range extension to old entries, day tap → DaySheet, Today pill re-scroll.
// Prereq: dev server on :5174 (bun run dev --port 5174), then:
//   NODE_PATH=/mnt/c/Repos/bookmarker/node_modules node bloom-calendar-e2e.cjs
const { chromium } = require('playwright');

const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoAdd = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const fail = (msg) => { console.error('ASSERT FAIL:', msg); process.exitCode = 1; };
  const ok = (msg) => console.log('ok -', msg);

  const today = localISO(new Date());
  const oldDay = isoAdd(today, -400); // ~13 months back → forces range extension
  const [todayY, todayM] = today.split('-').map(Number);
  const oldY = +oldDay.slice(0, 4), oldM = +oldDay.slice(5, 7) - 1;
  const em = oldY * 12 + oldM - 1; // one month before earliest entry
  const expFirst = `${Math.floor(em / 12)}-${((em % 12) + 12) % 12}`;

  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });

  // STEP 1 — seed: one old period day + one today entry
  await page.evaluate(({ oldDay, today }) => {
    localStorage.setItem('bloom.snapshot.v1', JSON.stringify({
      version: 1,
      entries: [
        { date: oldDay, flow: 'medium', symptoms: [], notes: '' },
        { date: today, flow: 'light', symptoms: [], notes: '' }
      ],
      updatedAt: new Date().toISOString()
    }));
  }, { oldDay, today });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForTimeout(700); // allow initial scroll rAF

  // STEP 2 — multiple month sections, oldest extended back before the entry
  const months = await page.evaluate(() =>
    [...document.querySelectorAll('[data-month]')].map((el) => el.getAttribute('data-month')));
  if (months.length >= 25) ok(`calendar renders ${months.length} scrollable months`);
  else fail('expected >= 25 months, got ' + months.length);
  if (months[0] === expFirst) ok(`range extended back to ${expFirst} (before ${oldDay})`);
  else fail(`first month ${months[0]}, expected ${expFirst}`);

  // STEP 3 — initial scroll lands on current month
  const pos = await page.evaluate(({ todayY, todayM }) => {
    const el = document.querySelector(`[data-month="${todayY}-${todayM}"]`);
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), scrollY: Math.round(window.scrollY) };
  }, { todayY, todayM });
  if (pos.scrollY > 500) ok('page scrolled down to current month (scrollY=' + pos.scrollY + ')');
  else fail('no initial scroll: scrollY=' + pos.scrollY);
  if (pos.top >= -80 && pos.top < 500) ok('current month near top of viewport (top=' + pos.top + ')');
  else fail('current month not in view: top=' + pos.top);

  // STEP 4 — tap old period day (scrolled away) → DaySheet for that date
  await page.click(`button[aria-label="${oldDay}"]`);
  await page.waitForTimeout(300);
  const sheet = await page.evaluate(() => document.body.innerText);
  const oldTitle = new Date(oldY, oldM, +oldDay.slice(8)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric' });
  if (sheet.includes(oldTitle) && sheet.toUpperCase().includes('PERIOD FLOW')) ok('old day tap opens DaySheet (' + oldTitle + ')');
  else fail('DaySheet for old day missing: ' + JSON.stringify(sheet.slice(0, 120)));
  await page.click('button[aria-label="Close"]');
  await page.waitForTimeout(300);

  // STEP 5 — Today pill scrolls back to current month
  await page.click('button[aria-label="Scroll to today"]');
  await page.waitForTimeout(500);
  const back = await page.evaluate(({ todayY, todayM }) => {
    const el = document.querySelector(`[data-month="${todayY}-${todayM}"]`);
    return { top: Math.round(el.getBoundingClientRect().top), scrollY: Math.round(window.scrollY) };
  }, { todayY, todayM });
  if (back.top >= -80 && back.top < 500) ok('Today pill re-scrolls to current month (top=' + back.top + ')');
  else fail('Today pill scroll failed: top=' + back.top + ' scrollY=' + back.scrollY);

  await page.screenshot({ path: '/tmp/bloom-calendar-scrollable.png' });
  console.log('JS ERRORS:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length) fail('page errors present');
  await browser.close();
  if (process.exitCode) { console.error('E2E FAILED'); process.exit(1); }
  console.log('E2E PASS');
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
