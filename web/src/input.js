// Keyboard and gamepad merged into one virtual controller.
const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  sonar: ['KeyZ', 'KeyJ', 'Space'], dash: ['KeyX', 'KeyK', 'ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'], confirm: ['Enter', 'Space', 'KeyZ'], back: ['Escape', 'Backspace', 'KeyX'],
};
const PAD = { sonar: [0], dash: [1, 2], pause: [9], confirm: [0], back: [1], up: [12], down: [13], left: [14], right: [15] };

export class Input {
  constructor() {
    this.down = new Set();
    this.tapped = new Set();   // keys pressed since the last poll, so very short taps are not lost
    this.prev = {};
    this.now = {};
    this.ax = 0; this.ay = 0;
    this.usingPad = false;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.down.add(e.code);
      this.tapped.add(e.code);
      this.usingPad = false;
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  poll() {
    this.prev = this.now;
    const now = {};
    for (const k in KEYS) now[k] = KEYS[k].some((c) => this.down.has(c) || this.tapped.has(c));
    this.tapped.clear();
    let ax = (now.right ? 1 : 0) - (now.left ? 1 : 0);
    let ay = (now.down ? 1 : 0) - (now.up ? 1 : 0);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const btn = (i) => p.buttons[i] && p.buttons[i].pressed;
      for (const k in PAD) if (PAD[k].some(btn)) { now[k] = true; this.usingPad = true; }
      const sx = p.axes[0] || 0, sy = p.axes[1] || 0;
      const m = Math.hypot(sx, sy);
      if (m > 0.2) {
        const k = Math.min(1, (m - 0.2) / 0.7) / m;
        ax = sx * k; ay = sy * k; this.usingPad = true;
      }
      if (btn(14)) ax = -1; if (btn(15)) ax = 1; if (btn(12)) ay = -1; if (btn(13)) ay = 1;
    }
    const m = Math.hypot(ax, ay);
    if (m > 1) { ax /= m; ay /= m; }
    // Let the stick drive menus too.
    if (ay < -0.6) now.up = true;
    if (ay > 0.6) now.down = true;
    if (ax < -0.6) now.left = true;
    if (ax > 0.6) now.right = true;
    this.ax = ax; this.ay = ay;
    this.now = now;
  }

  held(k) { return !!this.now[k]; }
  pressed(k) { return !!this.now[k] && !this.prev[k]; }
  released(k) { return !this.now[k] && !!this.prev[k]; }

  // Menu navigation with key repeat handled by the caller.
  nav() {
    const v = (this.pressed('down') ? 1 : 0) - (this.pressed('up') ? 1 : 0);
    const h = (this.pressed('right') ? 1 : 0) - (this.pressed('left') ? 1 : 0);
    return { v, h };
  }
}
