// Headless screenshots for checking visuals: node tools/shot.js <outDir> [scenario...]
// A scenario is "stage:x,y[:seconds][:name]" — teleports Mio and waits before capturing.
const { chromium } = require('playwright');

(async () => {
  const out = process.argv[2];
  const scen = process.argv.slice(3);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  for (const s of scen) {
    const [stage, pos, secs = '2', name = `${stage}_${pos}`] = s.split(':');
    await page.goto(`http://localhost:8080/?stage=${stage}&q=${process.env.Q || 'high'}`, { timeout: 180000 });
    try {
      await page.waitForFunction(() => window.__app && window.__app.mode === 'play' && window.__app.world, null, { timeout: 60000 });
    } catch (e) {
      console.log(logs.join('\n'));
      await page.screenshot({ path: `${out}/error.png` });
      throw e;
    }
    if (pos !== 'start') {
      const [x, y] = pos.split(',').map(Number);
      await page.evaluate(([x, y]) => { const w = window.__app.world; w.player.x = x; w.player.y = y; w.cam.x = x; w.cam.y = y; }, [x, y]);
    }
    // Fast-forward the simulation (rendering is too slow in software GL for time to pass on its own),
    // and keep song-stone dialogs out of the picture.
    await page.evaluate((secs) => {
      const app = window.__app, w = app.world;
      w.stones.forEach((s) => { s.read = true; s.shown = true; });
      for (const id of ['card', 'toast']) document.getElementById(id).style.display = 'none';
      const idle = { ax: 0, ay: 0, held: () => false, pressed: () => false, released: () => false };
      for (let i = 0; i < secs * 60; i++) w.update(1 / 60, idle, innerWidth / innerHeight);
    }, +secs);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
    const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
    console.log(`${name}: ~${fps} fps (software GL)`);
  }
  console.log(logs.slice(0, 40).join('\n'));
  await browser.close();
})();
