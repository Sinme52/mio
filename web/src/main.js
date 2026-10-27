// App shell: boot, menus, chapter flow, saving and the main loop.
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI, Menu } from './ui.js';
import { Drawer } from './draw.js';
import { World } from './game.js';
import { LEVELS } from './levels.js';
import { t, setLang, getLang, setPadPrompts } from './i18n.js';

const NO_INPUT = { ax: 0, ay: 0, held: () => false, pressed: () => false, released: () => false };
const IMAGES = ['mio', 'shark', 'leviathan', 'whale', 'fish_a', 'fish_b', 'turtle', 'manta', 'crystal', 'sky',
  'b1_far', 'b1_mid', 'b2_far', 'b2_mid', 'b3_far', 'b3_mid', 'b4_far', 'b4_mid'];
const SAVE_KEY = 'mio-save-v1';
const native = window.native || null;

function loadSave() {
  const def = { unlocked: 1, current: null, cleared: false, best: {},
    settings: { lang: navigator.language?.startsWith('ja') ? 'ja' : 'en', master: 8, music: 7, sfx: 8, quality: 'high', fullscreen: !!native, shake: true } };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) return { ...def, ...s, settings: { ...def.settings, ...s.settings } };
  } catch { /* fresh save */ }
  return def;
}

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.ui = new UI();
    this.input = new Input();
    this.audio = new Audio();
    this.save = loadSave();
    setLang(this.save.settings.lang);
    try {
      this.renderer = new Renderer(this.canvas);
    } catch (e) {
      document.getElementById('loadtext').textContent = e.message;
      throw e;
    }
    this.drawer = new Drawer(this.renderer);
    this.renderer.setQuality(this.save.settings.quality);
    this.mode = 'boot';
    this.world = null;
    this.stage = 1;
    this.last = performance.now();
    this.timer = 0;
    this.lastDialogClose = -99;
    const wake = () => { this.audio.init(); this.applyAudio(); };
    addEventListener('keydown', wake);
    addEventListener('pointerdown', wake);
    if (native) wake();
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  async boot() {
    this.ui.loading(0, t('loading'));
    await this.renderer.loadImages(IMAGES, 'assets/img', (p) => this.ui.loading(p, t('loading')));
    await document.fonts.ready;
    this.ui.hideLoading();
    this.applySettings();
    const q = new URLSearchParams(location.search);
    if (q.has('q')) this.renderer.setQuality(q.get('q'));
    if (q.has('stage')) this.startStage(+q.get('stage'), {});
    else this.title();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage unavailable */ }
  }

  achieve(id) { native?.achieve?.(id); }

  applyAudio() {
    const s = this.save.settings;
    this.audio.setVolumes({ master: s.master / 10, music: s.music / 10, sfx: s.sfx / 10 });
  }

  applySettings() {
    const s = this.save.settings;
    setLang(s.lang);
    this.renderer.setQuality(s.quality);
    this.applyAudio();
    if (native) native.setFullscreen?.(s.fullscreen);
  }

  // ---------------------------------------------------------------- screens
  title() {
    this.mode = 'title';
    this.world = null;
    this.ui.showHUD(false);
    this.audio.playSong(5);
    const s = this.ui.screen(`
      <div class="title-bg" style="background-image:url(assets/img/keyart.webp)"></div>
      <div class="rays"></div>
      <div class="title-shade"></div>
      <div class="title-col">
        <img class="logo" src="assets/img/logo.webp" alt="MIO">
        <div class="menu"></div>
      </div>`);
    this.ui.fade(0);
    const sv = this.save;
    const items = [
      { label: t('m_continue'), act: () => this.continueGame(), disabled: !sv.current },
      { label: t('m_start'), act: () => this.newGame() },
      { label: t('m_select'), act: () => this.chapterSelect(), disabled: sv.unlocked < 2 && !sv.cleared },
      { label: t('m_options'), act: () => this.options(() => this.title()) },
      { label: t('m_credits'), act: () => this.credits() },
    ];
    if (native) items.push({ label: t('m_quit'), act: () => native.quit() });
    this.menu = new Menu(s.querySelector('.menu'), items, { audio: this.audio, start: sv.current ? 0 : 1 });
  }

  chapterSelect() {
    this.mode = 'title';
    const s = this.ui.screen(`<div class="title-bg" style="background-image:url(assets/img/keyart.webp)"></div><div class="title-shade"></div>
      <div class="panel"><h2>${t('m_select')}</h2><div class="menu"></div></div>`);
    const items = LEVELS.map((L) => ({
      label: L.id <= this.save.unlocked || this.save.cleared ? t(`st_${L.id}`) : `${t(`st_${L.id}`).split(/　|—/)[0]} ― ${t('locked')}`,
      disabled: !(L.id <= this.save.unlocked || this.save.cleared),
      act: () => this.startStage(L.id, {}),
    }));
    items.push({ label: t('m_back'), act: () => this.title() });
    this.menu = new Menu(s.querySelector('.menu'), items, { audio: this.audio, onBack: () => this.title() });
  }

  options(back) {
    const prevMode = this.mode;
    this.mode = prevMode === 'pause' ? 'pause' : 'title';
    const s = this.ui.screen(`<div class="panel"><h2>${t('m_options')}</h2><div class="menu"></div></div>`, 'dim');
    const st = this.save.settings;
    const vol = (k) => ({ value: () => `${st[k]}`, left: () => { st[k] = Math.max(0, st[k] - 1); this.applyAudio(); }, right: () => { st[k] = Math.min(10, st[k] + 1); this.applyAudio(); } });
    const qs = ['low', 'medium', 'high'];
    const items = [
      { label: t('o_lang'), value: () => (st.lang === 'ja' ? '日本語' : 'English'),
        left: () => { st.lang = st.lang === 'ja' ? 'en' : 'ja'; setLang(st.lang); this.options(back); },
        right: () => { st.lang = st.lang === 'ja' ? 'en' : 'ja'; setLang(st.lang); this.options(back); } },
      { label: t('o_master'), ...vol('master') },
      { label: t('o_music'), ...vol('music') },
      { label: t('o_sfx'), ...vol('sfx') },
      { label: t('o_quality'), value: () => t(`q_${st.quality}`),
        left: () => { st.quality = qs[Math.max(0, qs.indexOf(st.quality) - 1)]; this.renderer.setQuality(st.quality); },
        right: () => { st.quality = qs[Math.min(2, qs.indexOf(st.quality) + 1)]; this.renderer.setQuality(st.quality); } },
      { label: t('o_full'), value: () => t(st.fullscreen ? 'o_on' : 'o_off'),
        left: () => this.toggleFullscreen(), right: () => this.toggleFullscreen() },
      { label: t('o_shake'), value: () => t(st.shake ? 'o_on' : 'o_off'), left: () => { st.shake = !st.shake; }, right: () => { st.shake = !st.shake; } },
      { label: t('m_back'), act: () => { this.persist(); back(); } },
    ];
    this.menu = new Menu(s.querySelector('.menu'), items, { audio: this.audio, onBack: () => { this.persist(); back(); } });
  }

  toggleFullscreen() {
    const st = this.save.settings;
    st.fullscreen = !st.fullscreen;
    if (native) native.setFullscreen?.(st.fullscreen);
    else if (st.fullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.();
  }

  credits() {
    this.mode = 'credits';
    this.timer = 0;
    this.ui.showHUD(false);
    this.ui.screen(`<div class="credits">${t('credits').replace(/\n/g, '<br>')}<br><br><br>${t('thanks')}</div>`, 'dim');
  }

  newGame() {
    this.save.current = { stage: 1, progress: {} };
    this.persist();
    this.story(t('prologue'), () => this.startStage(1, {}));
  }

  continueGame() {
    const c = this.save.current;
    if (!c) return this.newGame();
    this.startStage(c.stage, c.progress || {});
  }

  story(text, next) {
    this.mode = 'story';
    this.timer = 0;
    this.storyNext = next;
    const lines = text.split('\n').map((l, i) => `<div class="line" style="animation-delay:${0.6 + i * 1.6}s">${l || '&nbsp;'}</div>`).join('');
    this.ui.screen(`<div class="story">${lines}</div><div class="hint">${t('continue_hint')}</div>`, 'dim');
    this.ui.screenEl.style.background = 'radial-gradient(ellipse at center, #062a40, #000 80%)';
  }

  startStage(id, progress) {
    this.ui.fade(1);
    this.ui.screenEl.style.background = '';
    setTimeout(() => {
      const L = LEVELS[id - 1];
      this.stage = id;
      this.world = new World(L, progress);
      this.world.events.on((n, d) => this.onEvent(n, d));
      this.renderer.setLevel(L, this.world.terrain);
      this.audio.playSong(L.music);
      this.ui.clearScreen();
      this.ui.showHUD(true);
      this.ui.card(t(`st_${id}`));
      this.mode = 'play';
      this.save.current = { stage: id, progress };
      this.persist();
      setTimeout(() => this.ui.fade(0), 100);
    }, 650);
  }

  pause() {
    this.mode = 'pause';
    const s = this.ui.screen(`<div class="panel"><h2>${t('paused')}</h2><div class="menu"></div>
      <div class="controls">${this.controlsText()}</div></div>`, 'dim');
    const items = [
      { label: t('m_resume'), act: () => this.resume() },
      { label: t('m_options'), act: () => this.options(() => this.pause()) },
      { label: t('m_restart'), act: () => this.startStage(this.stage, {}) },
      { label: t('m_title'), act: () => { this.saveProgress(); this.title(); } },
    ];
    this.menu = new Menu(s.querySelector('.menu'), items, { audio: this.audio, onBack: () => this.resume() });
  }

  controlsText() {
    return getLang() === 'ja'
      ? '移動：方向キー / WASD / 左スティック　声・歌（長押し）：Z / Space / Ⓐ　ダッシュ：X / Shift / Ⓑ'
      : 'Swim: Arrows / WASD / Left stick   Call · Song (hold): Z / Space / Ⓐ   Dash: X / Shift / Ⓑ';
  }

  resume() {
    this.ui.clearScreen();
    this.mode = 'play';
    this.world.player.mute = true;
  }

  saveProgress() {
    if (!this.world || this.world.state === 'ending') return;
    this.save.current = { stage: this.stage, progress: this.world.progress() };
    this.persist();
  }

  // ---------------------------------------------------------------- world events → audio/UI/save
  onEvent(name, d) {
    const A = this.audio, w = this.world;
    switch (name) {
      case 'sonar': A.sfx('sonar'); break;
      case 'song': A.sfx('song'); this.achieve('ACH_FIRST_SONG'); break;
      case 'charge': A.sfx('charge', d); break;
      case 'dash': A.sfx('dash'); break;
      case 'leap': A.sfx('splash', Math.max(0.35, Math.min(2, d.k * 0.8))); A.setUnderwater(false); this.achieve('ACH_FIRST_LEAP'); break;
      case 'splash': A.sfx('splash', Math.max(0.35, Math.min(2, d.k))); A.setUnderwater(true); break;
      case 'trick': A.sfx('dash'); break;
      case 'breath': A.sfx('breath'); break;
      case 'hurt': A.sfx('hurt'); break;
      case 'eat': A.sfx('eat'); break;
      case 'pearl':
        A.sfx('pearl');
        this.saveProgress();
        if (w.stats.pearls === w.pearls.length) this.ui.toast(`✦ ${w.stats.pearls} / ${w.pearls.length}`);
        break;
      case 'stone':
        A.sfx('stone');
        this.saveProgress();
        // First visit always talks; afterwards only when Mio calls to it from close by.
        if (!d.shown || (w.time - this.lastDialogClose > 2.5 && Math.hypot(w.player.x - d.x, w.player.y - d.y) < 220)) {
          d.shown = true;
          this.ui.dialog(t(d.msg));
          this.mode = 'dialog';
        } else this.ui.toast(t('checkpoint'), 2);
        break;
      case 'gate': A.sfx('gate'); this.saveProgress(); break;
      case 'gateHint': this.ui.toast(t('gate_hint'), 4); break;
      case 'podHint': this.ui.toast(t('gate_hint'), 4); break;
      case 'pod':
        A.sfx('pod');
        this.ui.toast(t('pod_freed'), 3);
        this.achieve('ACH_FIRST_POD');
        this.saveProgress();
        break;
      case 'exitLocked': this.ui.toast(t('exit_locked', { n: w.stats.pods, m: w.pods.length }), 4); break;
      case 'jellyPop': A.sfx('jelly'); break;
      case 'sharkHit': A.sfx('shark'); break;
      case 'bite': A.sfx('shark'); break;
      case 'death':
        this.mode = 'gameover';
        this.timer = 0;
        this.ui.screen(`<div class="big">${t('gameover')}</div><div class="sub">${t('retry')}</div>`, 'dim');
        break;
      case 'clear': this.stageClear(); break;
      case 'bossWake': A.sfx('roar'); A.playSong(4); this.ui.toast(t('boss_intro'), 3); break;
      case 'bossLunge': A.sfx('roar'); break;
      case 'bossWave': A.sfx('wave'); break;
      case 'coreBreak': A.sfx('core'); if (d.left === 0) A.sfx('roar'); break;
      case 'bossDefeated':
        A.sfx('clear');
        A.playSong(5);
        this.achieve('ACH_SILENCE');
        if (w.stats.hurt === 0) this.achieve('ACH_UNTOUCHED');
        this.save.cleared = true;
        this.save.current = null;
        this.recordBest();
        this.persist();
        w.state = 'ending';
        setTimeout(() => this.ending(), 3500);
        break;
      default: break;
    }
  }

  recordBest() {
    const w = this.world, b = this.save.best[this.stage] || { pearls: 0, pods: 0 };
    this.save.best[this.stage] = { pearls: Math.max(b.pearls, w.stats.pearls), pods: Math.max(b.pods, w.stats.pods) };
    const all = LEVELS.every((L) => (this.save.best[L.id]?.pearls || 0) >= L.pearls.length);
    if (all) this.achieve('ACH_ALL_PEARLS');
  }

  stageClear() {
    const w = this.world;
    this.audio.sfx('clear');
    this.achieve(`ACH_CHAPTER_${this.stage}`);
    this.recordBest();
    this.save.unlocked = Math.max(this.save.unlocked, this.stage + 1);
    this.save.current = { stage: Math.min(this.stage + 1, LEVELS.length), progress: {} };
    this.persist();
    this.mode = 'clear';
    this.timer = 0;
    this.ui.screen(`<div class="big">${t('clear')}</div>
      <div class="sub">${t('results', { p: w.stats.pearls, pm: w.pearls.length, f: w.stats.pods, fm: w.pods.length })}</div>
      <div class="hint">${t('continue_hint')}</div>`, 'dim');
  }

  ending() {
    this.mode = 'ending';
    this.timer = 0;
    this.ui.showHUD(false);
    const lines = t('ending').split('\n').map((l, i) => `<div class="line" style="animation-delay:${0.5 + i * 1.8}s">${l || '&nbsp;'}</div>`).join('');
    this.ui.screen(`<div class="story">${lines}</div><div class="hint">${t('continue_hint')}</div>`);
  }

  // ---------------------------------------------------------------- loop
  loop(ts) {
    requestAnimationFrame((n) => this.loop(n));
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    const inp = this.input;
    inp.poll();
    setPadPrompts(inp.usingPad);
    this.audio.update();
    this.timer += dt;
    const w = this.world;
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);

    switch (this.mode) {
      case 'title':
        this.menu?.handle(inp);
        break;
      case 'pause':
        this.menu?.handle(inp);
        break;
      case 'story':
        if (this.timer > 0.8 && (inp.pressed('confirm') || inp.pressed('back'))) { this.mode = 'busy'; this.storyNext(); }
        break;
      case 'credits':
        if (this.timer > 1 && (inp.pressed('confirm') || inp.pressed('back')) || this.timer > 27) this.title();
        break;
      case 'play':
        if (inp.pressed('pause')) { this.pause(); break; }
        w.update(dt, inp, aspect);
        this.ui.updateHUD(w);
        break;
      case 'dialog':
        w.update(dt * 0.15, NO_INPUT, aspect);
        if (this.ui.dialogStep(dt, inp)) { this.mode = 'play'; w.player.mute = true; this.lastDialogClose = w.time; }
        break;
      case 'gameover':
        w.update(dt * 0.3, NO_INPUT, aspect);
        if (this.timer > 2.8) { w.respawn(); this.ui.clearScreen(); this.ui.showHUD(true); this.mode = 'play'; }
        break;
      case 'clear':
        w.update(dt, NO_INPUT, aspect);
        if (this.timer > 1.2 && inp.pressed('confirm')) {
          this.mode = 'busy';
          if (this.stage < LEVELS.length) this.startStage(this.stage + 1, {});
          else this.title();
        }
        break;
      case 'ending':
        w.update(dt, NO_INPUT, aspect);
        if (this.timer > 4 && inp.pressed('confirm')) this.credits();
        break;
      default:
        if (w && this.mode === 'busy') w.update(dt, NO_INPUT, aspect);
        break;
    }

    if (this.world && this.mode !== 'title' && this.mode !== 'credits' && this.mode !== 'story') {
      const W = this.world;
      const view = {
        cam: W.camView(this.save.settings.shake), time: W.time, rings: W.rings, creatures: W.creatures,
        flash: W.flash * 0.6, fade: 0,
        settings: { bloom: 0.55, wobble: 1, rays: 1 },
      };
      this.renderer.render(view, this.drawer.bind(W));
    }
  }
}

const app = new App();
window.__app = app;
app.boot().catch((e) => { console.error(e); document.getElementById('loadtext').textContent = String(e.message || e); });
