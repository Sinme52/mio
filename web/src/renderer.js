// Frame pipeline:
//   scene target: water/sky -> parallax layers & far creatures -> light shafts -> far particles
//                 -> back plants -> rock -> world sprites -> near particles -> foreground layer
//   light target (1/4 res): additive glows (player, sonar, bioluminescence)
//   world fx: distortion, lighting, caustic shimmer, surface line -> bloom -> composite to screen.
import * as G from './gl.js';
import * as S from './shaders.js';
import { makeTextures } from './textures.js';

const MAX_VERTS = 65536;

class Batch {
  constructor(gl, prg) {
    this.gl = gl;
    this.prg = prg;
    this.data = new Float32Array(MAX_VERTS * 8);
    this.n = 0;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    this.tex = null; this.fog = 0; this.parallax = 1;
  }

  begin(common) {
    this.common = common;
    this.n = 0;
    this.tex = null;
  }

  state(tex, fog = 0, parallax = 1) {
    if (tex !== this.tex || fog !== this.fog || parallax !== this.parallax) {
      this.flush();
      this.tex = tex; this.fog = fog; this.parallax = parallax;
    }
    if (this.n > MAX_VERTS - 600) this.flush();
  }

  v(x, y, u, w, r, g, b, a) {
    const d = this.data, i = this.n * 8;
    d[i] = x; d[i + 1] = y; d[i + 2] = u; d[i + 3] = w;
    d[i + 4] = r; d[i + 5] = g; d[i + 6] = b; d[i + 7] = a;
    this.n++;
  }

  // Rotated textured quad centred on (x, y). col = [r, g, b, a] straight colour; add = additive.
  quad(x, y, w, h, rot, col, add = false, uv = null) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hx = w / 2, hy = h / 2;
    const a = col[3];
    const r = col[0] * a, g = col[1] * a, b = col[2] * a, al = add ? 0 : a;
    const u0 = uv ? uv[0] : 0, v0 = uv ? uv[1] : 0, u1 = uv ? uv[2] : 1, v1 = uv ? uv[3] : 1;
    const px = (lx, ly) => x + lx * c - ly * s, py = (lx, ly) => y + lx * s + ly * c;
    const x0 = px(-hx, -hy), y0 = py(-hx, -hy), x1 = px(hx, -hy), y1 = py(hx, -hy);
    const x2 = px(hx, hy), y2 = py(hx, hy), x3 = px(-hx, hy), y3 = py(-hx, hy);
    this.v(x0, y0, u0, v0, r, g, b, al); this.v(x1, y1, u1, v0, r, g, b, al); this.v(x2, y2, u1, v1, r, g, b, al);
    this.v(x0, y0, u0, v0, r, g, b, al); this.v(x2, y2, u1, v1, r, g, b, al); this.v(x3, y3, u0, v1, r, g, b, al);
  }

  // Triangle strip given as pairs of [x, y, u, v] (top) and (bottom) per row.
  strip(rows, col, add = false) {
    const a = col[3];
    const r = col[0] * a, g = col[1] * a, b = col[2] * a, al = add ? 0 : a;
    for (let i = 0; i < rows.length - 1; i++) {
      const [t0, b0] = rows[i], [t1, b1] = rows[i + 1];
      const ca = t0[4] ?? 1, cb = t1[4] ?? 1;
      this.v(t0[0], t0[1], t0[2], t0[3], r * ca, g * ca, b * ca, al * ca);
      this.v(t1[0], t1[1], t1[2], t1[3], r * cb, g * cb, b * cb, al * cb);
      this.v(b1[0], b1[1], b1[2], b1[3], r * cb, g * cb, b * cb, al * cb);
      this.v(t0[0], t0[1], t0[2], t0[3], r * ca, g * ca, b * ca, al * ca);
      this.v(b1[0], b1[1], b1[2], b1[3], r * cb, g * cb, b * cb, al * cb);
      this.v(b0[0], b0[1], b0[2], b0[3], r * ca, g * ca, b * ca, al * ca);
    }
  }

  flush() {
    if (!this.n || !this.tex) { this.n = 0; return; }
    const gl = this.gl;
    G.use(gl, this.prg, { ...this.common, uTex: this.tex, uFog: this.fog, uParallax: this.parallax });
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * 8);
    gl.drawArrays(gl.TRIANGLES, 0, this.n);
    gl.bindVertexArray(null);
    this.n = 0;
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const { gl, hdr } = G.createContext(canvas);
    this.gl = gl;
    this.hdr = hdr;
    const P = (fs, name) => G.program(gl, S.FULLSCREEN_VS, fs, name);
    this.p = {
      bg: P(S.BACKGROUND_FS, 'background'),
      layer: P(S.LAYER_FS, 'layer'),
      rays: P(S.RAYS_FS, 'rays'),
      terrain: P(S.TERRAIN_FS, 'terrain'),
      worldfx: P(S.WORLDFX_FS, 'worldfx'),
      bright: P(S.BRIGHT_FS, 'bright'),
      blur: P(S.BLUR_FS, 'blur'),
      composite: P(S.COMPOSITE_FS, 'composite'),
      sprite: G.program(gl, S.SPRITE_VS, S.SPRITE_FS, 'sprite'),
    };
    this.batch = new Batch(gl, this.p.sprite);
    this.tri = gl.createVertexArray();
    gl.bindVertexArray(this.tri);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.tex = makeTextures(gl);
    this.images = {};
    this.quality = 'high';
    this.targets = null;
    this.size = [0, 0];
  }

  async loadImages(names, base, onProgress) {
    let done = 0;
    await Promise.all(names.map(async (n) => {
      const img = await G.loadImage(`${base}/${n}.webp`);
      const layer = /^b\d_/.test(n) || n === 'sky';
      const gl = this.gl;
      this.images[n] = G.texture(gl, img, layer ? { wrapS: gl.MIRRORED_REPEAT } : {});
      done++;
      onProgress?.(done / names.length);
    }));
  }

  setQuality(q) {
    this.quality = q;
    this.size = [0, 0];
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let scale = { high: 1, medium: 0.75, low: 0.5 }[this.quality] ?? 1;
    // Never shade more than ~1440p worth of pixels; 4K screens get a smooth upscale instead.
    const px = this.canvas.clientWidth * this.canvas.clientHeight * dpr * dpr * scale * scale;
    if (px > 2560 * 1440) scale *= Math.sqrt((2560 * 1440) / px);
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr * scale));
    const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr * scale));
    if (w === this.size[0] && h === this.size[1]) return;
    this.size = [w, h];
    this.canvas.width = w;
    this.canvas.height = h;
    const gl = this.gl;
    if (this.targets) Object.values(this.targets).forEach((t) => G.freeTarget(gl, t));
    const hdr = this.hdr;
    const q = (d) => [Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d))];
    this.targets = {
      scene: G.target(gl, w, h, hdr),
      fx: G.target(gl, w, h, hdr),
      light: G.target(gl, ...q(4), hdr),
      half: G.target(gl, ...q(2), hdr),
      qa: G.target(gl, ...q(4), hdr),
      qb: G.target(gl, ...q(4), hdr),
      ea: G.target(gl, ...q(8), hdr),
      eb: G.target(gl, ...q(8), hdr),
    };
  }

  setLevel(level, terrain) {
    const gl = this.gl;
    if (this.terrTex) gl.deleteTexture(this.terrTex.tex);
    this.terrTex = G.dataTexture(gl, terrain.w, terrain.h, terrain.texData);
    this.terrRect = terrain.rect;
    this.level = level;
  }

  fullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.tri);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // view: { cam:[x,y,hw,hh], time, rings, flash, fade, settings }, draw: callbacks that push sprites.
  render(view, draw) {
    this.resize();
    const gl = this.gl, T = this.targets, L = this.level, pal = L.palette;
    const common = {
      uCam: view.cam, uTime: view.time, uWaveAmp: 6,
      uShallow: pal.shallow, uMid: pal.mid, uDeep: pal.deep, uDepthRange: pal.depthRange,
    };
    const batch = this.batch;
    batch.begin(common);

    G.bindTarget(gl, T.scene);
    gl.disable(gl.BLEND);
    G.use(gl, this.p.bg, { ...common, uSky: this.images.sky, uSkySize: [2000, 900], uSeaBand: view.seaBand, uSkyTint: pal.sky,
      uSunDir: [pal.sun[0] * view.cam[2], 0, pal.sun[1]] });
    this.fullscreen();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Parallax layers interleaved with distant creatures, far to near.
    const items = L.layers.map((l) => ({ p: l.p, layer: l }));
    for (const c of view.creatures) items.push({ p: c.p, creature: c });
    items.sort((a, b) => a.p - b.p);
    for (const it of items) {
      if (it.layer) { batch.flush(); this.drawLayer(it.layer, common, view, 0.35 * (it.layer.p > 0.4 ? 1 : 0.4)); }
      else draw.creature(batch, it.creature);
    }
    batch.flush();

    G.use(gl, this.p.rays, { ...common, uParallax: 0.6, uIntensity: pal.rays * view.settings.rays,
      uRayDepth: pal.rayDepth, uRayColor: pal.rayColor });
    this.fullscreen();

    draw.particles(batch, 'far');
    draw.decor(batch, 'back');
    batch.flush();

    G.use(gl, this.p.terrain, { ...common, uTerr: this.terrTex, uTerrRect: this.terrRect, uRockA: pal.rockA,
      uRockB: pal.rockB, uRockTop: pal.rockTop, uRockGlow: pal.rockGlow, uCausticAmt: pal.caustic,
      uCausticDepth: pal.causticDepth });
    this.fullscreen();

    draw.decor(batch, 'front');
    draw.world(batch);
    draw.particles(batch, 'near');
    batch.flush();
    if (L.fg) this.drawLayer({ fog: 0, tint: L.fg.tint, ...L.fg }, common, view, 0);
    draw.particles(batch, 'bokeh');
    batch.flush();

    // Light buffer.
    G.bindTarget(gl, T.light);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    batch.begin(common);
    draw.lights(batch);
    batch.flush();

    gl.disable(gl.BLEND);
    G.bindTarget(gl, T.fx);
    const rings = new Float32Array(24);
    view.rings.slice(0, 6).forEach((r, i) => rings.set([r.x, r.y, r.r, r.k], i * 4));
    G.use(gl, this.p.worldfx, { ...common, uScene: T.scene, uLight: T.light, uRings: rings,
      uWobble: view.settings.wobble, uAmbDeep: pal.ambDeep, uDark: pal.dark, uCausticDepth: pal.causticDepth,
      uShimmer: pal.caustic });
    this.fullscreen();

    // Bloom chain.
    G.bindTarget(gl, T.half);
    G.use(gl, this.p.bright, { uTex: T.fx, uThreshold: 0.78 });
    this.fullscreen();
    const blur = (src, dst, dir) => { G.bindTarget(gl, dst); G.use(gl, this.p.blur, { uTex: src, uDir: dir }); this.fullscreen(); };
    blur(T.half, T.qa, [1, 0]); blur(T.qa, T.qb, [0, 1]);
    blur(T.qb, T.qa, [2, 0]); blur(T.qa, T.qb, [0, 2]);
    blur(T.qb, T.ea, [1, 0]); blur(T.ea, T.eb, [0, 1]);
    blur(T.eb, T.ea, [2, 0]); blur(T.ea, T.eb, [0, 2]);

    G.bindTarget(gl, null);
    G.use(gl, this.p.composite, { uTex: T.fx, uBloom: T.qb, uBloom2: T.eb, uBloomAmt: view.settings.bloom,
      uExposure: pal.exposure, uFade: view.fade, uTime: view.time % 100, uGrade: pal.grade, uFlash: view.flash });
    this.fullscreen();
  }

  drawLayer(l, common, view, caustic) {
    const gl = this.gl;
    const img = this.images[l.img];
    const width = l.height * (img.w / img.h);
    G.use(gl, this.p.layer, { ...common, uTex: img, uLayer: [l.p, l.bottom, l.height, width],
      uLayer2: [l.x ?? 0, l.fog ?? 0, l.alpha ?? 1, l.blur ?? 0], uTint: l.tint ?? [1, 1, 1], uCausticAmt: caustic });
    this.fullscreen();
  }
}
