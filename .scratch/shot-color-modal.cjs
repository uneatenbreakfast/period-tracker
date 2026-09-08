// Screenshot the new color-picker modal for visual review.
const { chromium } = require('playwright');
const BASE = process.env.BLOOM_BASE_URL || 'http://localhost:5174/';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  // Settings tab
  await page.click(`nav[aria-label="Views"] button:has-text("Settings")`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/bloom-settings.png' });
  // Open Period picker modal
  await page.click('[data-testid="settings-style-period-input"]');
  await page.waitForSelector('[data-testid="color-picker-hex-input"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/bloom-color-modal.png' });
  // Drag the SV box to a different color (click 70% right, 30% down from top)
  const sv = await page.locator('[data-testid="color-picker-sv"]').boundingBox();
  if (sv) {
    await page.mouse.click(sv.x + sv.width * 0.7, sv.y + sv.height * 0.3);
    await page.waitForTimeout(200);
  }
  const hue = await page.locator('[data-testid="color-picker-hue"]').boundingBox();
  if (hue) {
    await page.mouse.click(hue.x + hue.width * 0.85, hue.y + hue.height / 2);
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: '/tmp/bloom-color-modal-picked.png' });
  // Close via backdrop tap after verifying hex updated
  const hexVal = await page.inputValue('[data-testid="color-picker-hex-input"]');
  console.log('hex after picker drags:', hexVal);
  await browser.close();
})();