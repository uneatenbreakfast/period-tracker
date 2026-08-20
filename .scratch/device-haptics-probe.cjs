// Device haptics probe — connects to phone browser WebView via adb-forwarded CDP.
// Phase 1: browser/env facts. Phase 2: wrap navigator.vibrate. Phase 3: real long-press → read records.
const { chromium } = require('playwright');

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9223';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_HTTP);
  } catch (e) {
    console.log('CONNECT_FAIL', e.message.split('\n')[0]);
    process.exit(1);
  }
  const pages = browser.contexts().flatMap((c) => c.pages());
  console.log('PAGES:', pages.map((p) => p.url().slice(0, 90)));
  const page = pages.find((p) => p.url().includes('5190')) || pages[0];
  if (!page) { console.log('NO_PAGE'); process.exit(1); }
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(1500);

  // ---- Phase 1: environment facts ----
  const info = await page.evaluate(() => {
    const days = [...document.querySelectorAll('button')].filter((b) => /^\d{1,2}$/.test(b.textContent.trim()));
    const day = days[0];
    const r = day ? day.getBoundingClientRect() : null;
    return {
      href: location.href,
      secure: window.isSecureContext,
      vibrateType: typeof navigator.vibrate,
      hasActivation: typeof navigator.userActivation === 'object',
      activation: navigator.userActivation ? { active: navigator.userActivation.isActive, beenActive: navigator.userActivation.hasBeenActive } : null,
      userAgent: navigator.userAgent.slice(0, 120),
      dayCount: days.length,
      day0: day ? { text: day.textContent.trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null,
    };
  });
  console.log('INFO', JSON.stringify(info));

  // ---- Phase 2: wrap vibrate so app calls are recorded ----
  await page.evaluate(() => {
    const orig = navigator.vibrate.bind(navigator);
    window.__vr = { calls: [] };
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      get() {
        return (...args) => {
          let ret = false;
          try { ret = orig(...args); } catch (e) { ret = 'THREW:' + e.message; }
          window.__vr.calls.push({ t: Date.now(), args, ret });
          return ret;
        };
      },
    });
  });

  // ---- Phase 3: direct API test (big pulse — user should FEEL this) ----
  const direct = await page.evaluate(() => {
    const before = window.__vr.calls.length;
    const ret = navigator.vibrate(120);
    return { before, ret, after: window.__vr.calls.length, last: window.__vr.calls[window.__vr.calls.length - 1] };
  });
  console.log('DIRECT120', JSON.stringify(direct));

  // ---- Phase 4: real long-press on a day cell via CDP touch ----
  if (!info.day0) { console.log('NO_DAY_CELL'); process.exit(0); }
  const cdp = await page.context().newCDPSession(page);
  const { x, y } = info.day0;
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(600); // LONG_PRESS_MS 400 → arm fires during hold
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } catch (e) {
    console.log('TOUCH_FAIL', e.message.split('\n')[0]);
  }
  await sleep(500);
  const grabbed = await page.evaluate(() => ({ calls: window.__vr.calls.map((c) => ({ args: c.args, ret: c.ret })) }));
  console.log('RECORDS', JSON.stringify(grabbed));
  await browser.close();
})().catch((e) => { console.log('ERR', e.message.split('\n')[0]); process.exit(1); });