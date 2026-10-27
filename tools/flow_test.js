// Clicks through title -> prologue -> chapter 1 -> pause in headless Chromium and saves screenshots.
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: process.env.LOCALE || 'ja-JP' });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:8080/?q=low');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__app?.mode === 'title', null, { timeout: 120000, polling: 500 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/title.png`, timeout: 120000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__app.mode === 'story', null, { polling: 500, timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/story.png`, timeout: 120000 });
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction(() => window.__app.mode === 'play', null, { timeout: 120000, polling: 500 });
  } catch (e) {
    console.log('mode:', await page.evaluate(() => window.__app.mode), '\nerrors:', errors.join('\n'));
    throw e;
  }
  const perf = async (label) => console.log(label, await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r((n / 2).toFixed(1) + ' fps'); }; requestAnimationFrame(f); })));
  await perf('with audio:');
  if (process.env.NOAUDIO) { await page.evaluate(() => window.__app.audio.ctx?.suspend()); await perf('audio suspended:'); }
  // Swim right for a bit, call, then pause.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(3000);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/play.png`, timeout: 120000 });
  const st = await page.evaluate(() => ({ mode: window.__app.mode, x: window.__app.world.player.x, audio: !!window.__app.audio.ctx, state: window.__app.audio.ctx?.state }));
  console.log('after swim:', JSON.stringify(st));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/pause.png`, timeout: 120000 });
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
