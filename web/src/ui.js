// DOM overlay: HUD, toasts, chapter cards, song-stone dialogs and menus.
import { t } from './i18n.js';
import { P } from './player.js';

const $ = (id) => document.getElementById(id);

export class Menu {
  // items: { label, act?, value?: () => string, left?, right?, disabled? }
  constructor(el, items, { onBack, audio, start = 0 } = {}) {
    this.el = el; this.items = items; this.onBack = onBack; this.audio = audio;
    this.sel = Math.max(0, start);
    while (this.items[this.sel]?.disabled && this.sel < this.items.length - 1) this.sel++;
    this.render();
  }

  render() {
    this.el.innerHTML = '';
    this.items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'item' + (i === this.sel ? ' sel' : '') + (it.disabled ? ' off' : '');
      const l = document.createElement('span'); l.textContent = it.label;
      d.appendChild(l);
      if (it.value) { const v = document.createElement('span'); v.className = 'val'; v.textContent = it.value(); d.appendChild(v); }
      d.onmouseenter = () => { if (!it.disabled && this.sel !== i) { this.sel = i; this.audio?.sfx('ui'); this.render(); } };
      d.onclick = () => { if (it.disabled) return; this.sel = i; if (it.value) this.change(1); else this.activate(); };
      this.el.appendChild(d);
    });
  }

  move(dir) {
    let i = this.sel;
    for (let n = 0; n < this.items.length; n++) {
      i = (i + dir + this.items.length) % this.items.length;
      if (!this.items[i].disabled) break;
    }
    if (i !== this.sel) { this.sel = i; this.audio?.sfx('ui'); this.render(); }
  }

  change(dir) {
    const it = this.items[this.sel];
    const fn = dir < 0 ? it.left : it.right;
    if (fn) { fn(); this.audio?.sfx('ui'); this.render(); }
  }

  activate() {
    const it = this.items[this.sel];
    if (it.act) { this.audio?.sfx('select'); it.act(); }
  }

  handle(input) {
    const { v, h } = input.nav();
    if (v) this.move(v);
    if (h) this.change(h);
    if (input.pressed('confirm')) {
      const it = this.items[this.sel];
      if (it.value && !it.act) this.change(1); else this.activate();
    } else if (input.pressed('back') && this.onBack) { this.audio?.sfx('ui'); this.onBack(); }
  }
}

export class UI {
  constructor() {
    this.hud = $('hud'); this.screenEl = $('screen');
    this.last = {};
    this.toastTimer = 0;
    this.dialogFull = ''; this.dialogShown = 0;
  }

  loading(p, text) {
    $('loadfill').style.width = `${Math.round(p * 100)}%`;
    $('loadtext').textContent = text;
  }

  hideLoading() {
    const l = $('loading');
    l.style.opacity = 0;
    setTimeout(() => l.remove(), 900);
  }

  fade(v) { $('fade').style.opacity = v; }

  showHUD(on) { this.hud.classList.toggle('hidden', !on); this.last = {}; }

  updateHUD(w) {
    const pl = w.player, L = this.last;
    if (L.health !== pl.health) {
      L.health = pl.health;
      $('health').innerHTML = Array.from({ length: P.maxHealth }, (_, i) => `<div class="pip${i < pl.health ? '' : ' empty'}"></div>`).join('');
    }
    const air = Math.round(pl.air * 200) / 200;
    if (L.air !== air) {
      L.air = air;
      $('airfill').style.transform = `scaleX(${air})`;
      $('air').classList.toggle('low', air < 0.25);
    }
    const pods = `${w.stats.pods} / ${w.pods.length}`, pearls = `${w.stats.pearls} / ${w.pearls.length}`;
    if (L.pods !== pods || L.pearls !== pearls) {
      L.pods = pods; L.pearls = pearls;
      $('podc').innerHTML = w.pods.length ? `<span class="icon pod"></span>${pods}` : '';
      $('pearlc').innerHTML = `<span class="icon pearl"></span>${pearls}`;
    }
    const b = w.boss;
    const bossOn = !!b && b.state !== 'dormant' && b.dissolve < 1;
    if (L.bossOn !== bossOn) { L.bossOn = bossOn; $('bossbar').classList.toggle('hidden', !bossOn); $('bossname').textContent = t('boss_name'); }
    if (bossOn) {
      const cores = b.cores.map((c) => (c.alive ? 1 : 0)).join('');
      if (L.cores !== cores) { L.cores = cores; $('bosscores').innerHTML = b.cores.map((c) => `<div class="core${c.alive ? '' : ' broken'}"></div>`).join(''); }
    }
    const ch = Math.round(pl.charge * 50) / 50;
    if (L.charge !== ch) {
      L.charge = ch;
      $('charge').style.opacity = ch > 0 ? 1 : 0;
      $('charge').querySelector('circle').style.strokeDashoffset = 276.5 * (1 - ch);
    }
  }

  toast(text, sec = 3) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), sec * 1000);
  }

  card(text) {
    const el = $('card');
    el.classList.add('hidden');
    void el.offsetWidth;
    el.querySelector('.card-title').textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => el.classList.add('hidden'), 4700);
  }

  dialog(text) {
    this.dialogFull = text; this.dialogShown = 0;
    $('dialogtext').textContent = '';
    $('dialoghint').textContent = '';
    $('dialog').classList.remove('hidden');
  }

  // Returns true once the dialog is closed.
  dialogStep(dt, input) {
    if (this.dialogShown < this.dialogFull.length) {
      this.dialogShown = Math.min(this.dialogFull.length, this.dialogShown + dt * 38);
      $('dialogtext').textContent = this.dialogFull.slice(0, Math.floor(this.dialogShown));
      if (input.pressed('confirm') || input.pressed('sonar')) this.dialogShown = this.dialogFull.length;
      if (this.dialogShown >= this.dialogFull.length) { $('dialogtext').textContent = this.dialogFull; $('dialoghint').textContent = '▼'; }
      return false;
    }
    if (input.pressed('confirm') || input.pressed('sonar') || input.pressed('back')) {
      $('dialog').classList.add('hidden');
      return true;
    }
    return false;
  }

  screen(html, cls = '') {
    const s = this.screenEl;
    s.className = cls;
    s.innerHTML = html;
    return s;
  }

  clearScreen() { this.screenEl.className = 'hidden'; this.screenEl.innerHTML = ''; }
}
