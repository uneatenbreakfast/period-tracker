// Bloom Settings E2E (BLOOM-0002 + BLOOM-0022) — seed one period, verify the
// Settings tab steppers, that changing them reshapes predictions (card
// "Average cycle"), that the choices persist through reload via the snapshot
// blob, and that the Style section recolorizes calendar cells + legend.
// Prereq: dev server (bun run dev --port 5176), run:
//   NODE_PATH=/mnt/c/Repos/bookmarker/node_modules node bloom-settings-e2e.cjs
// Pass BLOOM_BASE_URL=http://localhost:5176/ when another agent owns 5174.
const { chromium } = require('playwright');
const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5174/';

// One 5-day period whose last start sits 17 days ago -> next = start + 28 (default).
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

  const today = new Date().toISOString().slice(0, 10); // UTC date for seed anchoring
  const start = isoAdd(today, -17);
  const seed = [];
  for (let i = 0; i < 5; i++) seed.push({ date: isoAdd(start, i), flow: i % 2 ? 'medium' : 'light', symptoms: [] });

  const goTab = async (name) => {
    await page.click(`nav[aria-label="Views"] button:has-text("${name}")`);
    await page.waitForTimeout(250);
  };

  const stepperValue = async (testId) => {
    return Number(await page.textContent(`[data-testid="${testId}-value"]`));
  };

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((seed) => {
    localStorage.setItem('bloom.snapshot.v1', JSON.stringify({ version: 1, entries: seed, updatedAt: new Date().toISOString() }));
  }, seed);
  await page.reload({ waitUntil: 'networkidle0' });

  // STEP 1 — Settings tab exists, defaults shown (Fitbit 28 / 5)
  await goTab('Settings');
  const body = await page.evaluate(() => document.body.innerText);
  if (body.toUpperCase().includes('SETTINGS')) ok('settings tab shows SETTINGS heading');
  else fail('settings heading missing');
  if ((await stepperValue('settings-cycle-length')) === 28) ok('cycle length default = 28');
  else fail('cycle length default wrong: ' + (await stepperValue('settings-cycle-length')));
  if ((await stepperValue('settings-period-length')) === 5) ok('period length default = 5');
  else fail('period length default wrong: ' + (await stepperValue('settings-period-length')));

  // STEP 2 — steppers adjust
  await page.click('[data-testid="settings-cycle-length-plus"]');
  await page.waitForTimeout(100);
  if ((await stepperValue('settings-cycle-length')) === 29) ok('cycle length plus -> 29');
  else fail('cycle length plus did not bump');
  await page.click('[data-testid="settings-period-length-plus"]');
  await page.click('[data-testid="settings-period-length-plus"]');
  await page.waitForTimeout(100);
  if ((await stepperValue('settings-period-length')) === 7) ok('period length plus x2 -> 7');
  else fail('period length plus did not bump');

  // STEP 3 — prediction reshaped: single cycle uses the custom 29-day default
  await goTab('Health');
  const healthText = await page.evaluate(() => document.body.innerText);
  if (healthText.includes('29 days')) ok('health card average cycle now 29 days');
  else fail('health card did not adopt custom default: ' + JSON.stringify(healthText.match(/Average cycle[^0-9]*(\d+) days/)));

  // STEP 4 — persistence through reload (snapshot blob carries settings)
  await page.reload({ waitUntil: 'networkidle0' });
  await goTab('Settings');
  if ((await stepperValue('settings-cycle-length')) === 29) ok('cycle length 29 survives reload');
  else fail('cycle length did not persist');
  if ((await stepperValue('settings-period-length')) === 7) ok('period length 7 survives reload');
  else fail('period length did not persist');
  const blob = await page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1') || 'null'));
  if (blob && blob.settings && blob.settings.cycleLength === 29 && blob.settings.periodLength === 7)
    ok('localStorage blob carries {cycleLength: 29, periodLength: 7}');
  else fail('blob settings wrong: ' + JSON.stringify(blob && blob.settings));

  // STEP 5 — bounds respected: plus on a maxed stepper is disabled
  const clickMinusMany = async () => {
    for (let i = 0; i < 99; i++) {
      const disabled = await page.getAttribute('[data-testid="settings-period-length-minus"]', 'disabled');
      if (disabled !== null) break;
      await page.click('[data-testid="settings-period-length-minus"]');
    }
    return stepperValue('settings-period-length');
  };
  const floor = await clickMinusMany();
  if (floor === 1) ok('period length clamps at 1 (min bound)');
  else fail('period length min bound wrong: ' + floor);
  const minusDisabled = await page.getAttribute('[data-testid="settings-period-length-minus"]', 'disabled');
  if (minusDisabled !== null) ok('minus button disabled at min');
  else fail('minus button still enabled at min');

  // STEP 6 — Style section exists with the 5 calendar color pickers, all
  // showing the shipped pastel defaults (BLOOM-0022).
  const DEFAULTS = {
    period: '#e58aa8',
    predicted: '#e89db9',
    fertile: '#e4dcf3',
    ovulation: '#b9a7d9',
    safe: '#e3eddd',
  };
  for (const key of Object.keys(DEFAULTS)) {
    const v = await page.getAttribute(`[data-testid="settings-style-${key}-input"]`, 'value');
    if (v === DEFAULTS[key]) ok(`style ${key} picker default ${v}`);
    else fail(`style ${key} picker default wrong: ${v}`);
  }
  const swatchBg = async (testId) =>
    page.evaluate((s) => {
      const label = document.querySelector(`[data-testid="${s}"] label`);
      return label ? getComputedStyle(label).backgroundColor : '';
    }, testId);

  // STEP 7 — user picks new colors; swatches + persisted blob follow.
  const setColor = async (testId, hex) => {
    const sel = `[data-testid="${testId}"]`;
    try {
      await page.fill(sel, hex);
    } catch {
      await page.evaluate(
        ([s, h]) => {
          const el = document.querySelector(s);
          if (!el) return;
          el.value = h;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        [sel, hex],
      );
    }
    await page.waitForTimeout(200);
  };
  await setColor('settings-style-period-input', '#3366ff');
  if ((await swatchBg('settings-style-period')) === 'rgb(51, 102, 255)')
    ok('period swatch reflects #3366ff');
  else fail('period swatch bg wrong: ' + (await swatchBg('settings-style-period')));
  await setColor('settings-style-ovulation-input', '#00aa00');
  if ((await swatchBg('settings-style-ovulation')) === 'rgb(0, 170, 0)')
    ok('ovulation swatch reflects #00aa00');
  else fail('ovulation swatch bg wrong: ' + (await swatchBg('settings-style-ovulation')));
  let blobStyle = await page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1') || 'null'));
  if (blobStyle && blobStyle.settings && blobStyle.settings.style && blobStyle.settings.style.period === '#3366ff' && blobStyle.settings.style.ovulation === '#00aa00')
    ok('localStorage blob carries style {period: #3366ff, ovulation: #00aa00}');
  else fail('blob style wrong: ' + JSON.stringify(blobStyle && blobStyle.settings && blobStyle.settings.style));

  // STEP 8 — calendar cells + legend recolorized (period day fill, legend
  // swatches) — the whole point of the Style section.
  await goTab('Calendar');
  const legendBg = async (which) =>
    page.evaluate((w) => {
      const el = document.querySelector(`[data-legend="${w}"]`);
      return el ? getComputedStyle(el).backgroundColor : '';
    }, which);
  if ((await legendBg('period')) === 'rgb(51, 102, 255)') ok('legend period swatch now #3366ff');
  else fail('legend period swatch wrong: ' + (await legendBg('period')));
  const ovRing = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-legend="ovulation"]')).boxShadow,
  );
  if (ovRing.includes('rgb(0, 170, 0)')) ok('legend ovulation ring now #00aa00');
  else fail('legend ovulation ring wrong: ' + ovRing);
  // Seeded period day: button fill on untinted months, overlay span on tinted.
  const cellPeriodColor = async (iso) =>
    page.evaluate((i) => {
      const btn = document.querySelector(`button[aria-label="${i}"]`);
      if (!btn) return '';
      const painted = (n) => (n.style && n.style.backgroundColor) || '';
      let c = painted(btn);
      if (!c) for (const span of btn.querySelectorAll('span')) if ((c = painted(span))) break;
      return c;
    }, iso);
  let cellColor = await cellPeriodColor(start);
  if (!cellColor) {
    await page.evaluate(() => { const el = document.querySelector('[data-calendar-scroll]'); if (el) el.scrollTop = 0; });
    await page.waitForTimeout(500);
    cellColor = await cellPeriodColor(start);
  }
  if (cellColor === 'rgb(51, 102, 255)') ok(`period day ${start} cell painted #3366ff`);
  else fail(`period day cell not recolored: ${cellColor || '(not found)'}`);
  if ((await legendBg('ovulation')) === 'rgb(255, 255, 255)') ok('ovulation swatch stays white (ring carries the color)');
  else fail('ovulation swatch changed unexpectedly: ' + (await legendBg('ovulation')));

  // STEP 9 — colors survive reload (style persisted with the blob)
  await page.reload({ waitUntil: 'networkidle0' });
  await goTab('Calendar');
  if ((await legendBg('period')) === 'rgb(51, 102, 255)') ok('legend period #3366ff survives reload');
  else fail('legend period color lost after reload: ' + (await legendBg('period')));
  blobStyle = await page.evaluate(() => JSON.parse(localStorage.getItem('bloom.snapshot.v1') || 'null'));
  if (blobStyle && blobStyle.settings && blobStyle.settings.style && blobStyle.settings.style.period === '#3366ff')
    ok('style.period persisted in blob after reload');
  else fail('style.period missing from blob: ' + JSON.stringify(blobStyle && blobStyle.settings && blobStyle.settings.style));

  if (errors.length) fail('JS errors: ' + errors.join(' | '));
  else ok('no page errors');

  await browser.close();
  console.log(process.exitCode ? 'SETTINGS E2E FAILED' : 'SETTINGS E2E PASS');
})();