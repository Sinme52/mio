// GLSL sources. World space is in "units" with +y pointing down; the sea surface sits around y = 0.

const HEAD = `#version 300 es
precision highp float;
`;

// Shared by every pass that needs to know where the water is and what colour it has.
const WATER = `
uniform vec4 uCam;          // camera centre xy, half extents zw (world units)
uniform float uTime;
uniform float uWaveAmp;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec2 uDepthRange;   // depth where the mid colour is reached, depth where the deep colour is reached

vec2 worldAt(vec2 uv) { return uCam.xy + (uv * 2.0 - 1.0) * vec2(uCam.z, -uCam.w); }

float surfaceY(float x) {
  return uWaveAmp * (0.6 * sin(x * 0.011 + uTime * 1.3) + 0.3 * sin(x * 0.023 - uTime * 1.9) + 0.1 * sin(x * 0.047 + uTime * 2.7));
}

vec3 waterColor(float depth) {
  float d = max(depth, 0.0);
  vec3 c = mix(uShallow, uMid, smoothstep(0.0, uDepthRange.x, d));
  return mix(c, uDeep, smoothstep(uDepthRange.x, uDepthRange.y, d));
}
`;

const NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return v / 0.96875;
}
// Distance between the two nearest animated cell points; small values trace the cell borders,
// which is where light focuses into caustic lines.
float cellEdge(vec2 p, float t) {
  vec2 g = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y);
    vec2 h = hash22(g + o);
    vec2 r = o + 0.5 + 0.42 * sin(t + 6.2831 * h) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
float caustics(vec2 p, float t) {
  p += 0.18 * vec2(sin(p.y * 1.7 + t), cos(p.x * 1.3 - t * 0.8));
  float a = 1.0 - smoothstep(0.0, 0.16, cellEdge(p, t));
  float b = 1.0 - smoothstep(0.0, 0.16, cellEdge(p * 1.63 + vec2(3.1, 1.7), t * 1.27));
  return a * 0.55 + b * 0.35 + a * b * 0.9;
}
`;

export const FULLSCREEN_VS = HEAD + `
layout(location = 0) in vec2 aPos;
out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Water volume and sky.
export const BACKGROUND_FS = HEAD + WATER + NOISE + `
in vec2 vUV;
out vec4 o;
uniform sampler2D uSky;
uniform vec2 uSkySize;      // world size the sky image covers
uniform vec3 uSkyTint;
uniform vec3 uSunDir;       // x position of sun glow relative to the camera (world units), strength
void main() {
  vec2 w = worldAt(vUV);
  float sy = surfaceY(w.x);
  if (w.y < sy) {
    float h = sy - w.y;
    float u = 0.5 + (w.x - uCam.x) / uSkySize.x + uCam.x * 0.00003;
    vec3 sky = texture(uSky, vec2(u, 0.9 - h / uSkySize.y)).rgb;
    o = vec4(sky * uSkyTint, 1.0);
    return;
  }
  float d = w.y - sy;
  vec3 c = waterColor(d);
  // Light scattering: brighter towards the surface and towards the sun side.
  float sx = (w.x - uCam.x - uSunDir.x) / (uCam.z * 2.0);
  c += uShallow * 0.22 * exp(-d / 120.0) * (1.0 + 0.6 * exp(-sx * sx * 4.0)) * uSunDir.z;
  // Very slow drifting turbidity.
  c *= 0.93 + 0.14 * fbm(vec2(w.x * 0.0015 + uTime * 0.01, w.y * 0.002));
  o = vec4(c, 1.0);
}
`;

// A horizontally repeating parallax layer (premultiplied alpha).
export const LAYER_FS = HEAD + WATER + NOISE + `
in vec2 vUV;
out vec4 o;
uniform sampler2D uTex;
uniform vec4 uLayer;   // parallax, bottom y, height, tile width
uniform vec4 uLayer2;  // x offset, fog amount, opacity, blur (mip bias)
uniform vec3 uTint;
uniform float uCausticAmt;
uniform float uFlipV;
void main() {
  vec2 s = (vUV * 2.0 - 1.0) * vec2(uCam.z, -uCam.w);
  vec2 w = uCam.xy + s;
  float p = uLayer.x;
  float lx = s.x + uCam.x * p + uLayer2.x;
  float ly = s.y + uCam.y * p + uLayer.y * (1.0 - p);
  float v = 1.0 - (uLayer.y - ly) / uLayer.z;
  if (v < 0.0) discard;
  v = min(v, 0.998);
  vec4 t = texture(uTex, vec2(lx / uLayer.w, v), uLayer2.w);
  if (t.a < 0.002) discard;
  float d = w.y - surfaceY(w.x);
  vec3 fogc = waterColor(d + 120.0 * (1.0 - p)) * 1.05;
  vec3 c = mix(t.rgb * uTint, fogc * t.a, uLayer2.y);
  float cf = exp(-max(d, 0.0) / 500.0);
  c += vec3(0.55, 0.85, 1.0) * caustics(vec2(lx, ly) * 0.01, uTime * 0.5) * uCausticAmt * cf * t.a;
  float a = uLayer2.z * smoothstep(-3.0, 3.0, d);
  o = vec4(c, t.a) * a;
}
`;

// Volumetric light shafts from the surface, added on top of the background layers.
export const RAYS_FS = HEAD + WATER + NOISE + `
in vec2 vUV;
out vec4 o;
uniform float uParallax;
uniform float uIntensity;
uniform float uRayDepth;
uniform vec3 uRayColor;
void main() {
  vec2 w = worldAt(vUV);
  float d = w.y - surfaceY(w.x);
  if (d < 0.0) { o = vec4(0.0); return; }
  float xr = (w.x - uCam.x) + uCam.x * uParallax;
  float u = xr + d * 0.32;
  float r = vnoise(vec2(u * 0.0045, uTime * 0.1)) * 0.6 + vnoise(vec2(u * 0.013 + 4.0, uTime * 0.07 + 2.0)) * 0.4;
  r = pow(smoothstep(0.35, 1.0, r), 1.5) * 1.6;
  float fine = 0.6 + 0.4 * vnoise(vec2(u * 0.05, uTime * 0.3));
  float fade = exp(-d / uRayDepth) * smoothstep(0.0, 60.0, d);
  o = vec4(uRayColor * r * fine * fade * uIntensity, 0.0);
}
`;

// Rock rendered from the terrain density texture (R = density, G = depth inside the rock).
export const TERRAIN_FS = HEAD + WATER + NOISE + `
in vec2 vUV;
out vec4 o;
uniform sampler2D uTerr;
uniform vec4 uTerrRect;    // world x0, y0, width, height
uniform vec3 uRockA;
uniform vec3 uRockB;
uniform vec3 uRockTop;
uniform vec3 uRockGlow;
uniform float uCausticAmt;
uniform float uCausticDepth;
void main() {
  vec2 w = worldAt(vUV);
  vec2 uv = (w - uTerrRect.xy) / uTerrRect.zw;
  if (uv.y < 0.0) discard;
  vec4 t = texture(uTerr, clamp(uv, 0.0, 1.0));
  float dens = t.r, inner = t.g;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y > 1.0) { dens = 1.0; inner = 1.0; }
  float aw = max(fwidth(dens), 0.004);
  float a = smoothstep(0.5 - aw, 0.5 + aw, dens);
  if (a < 0.003) discard;
  vec2 tx = 1.5 / vec2(textureSize(uTerr, 0));
  // Density changes only near the edge; the depth-inside-rock channel is smooth everywhere inside.
  vec4 sx1 = texture(uTerr, uv + vec2(tx.x, 0)), sx0 = texture(uTerr, uv - vec2(tx.x, 0));
  vec4 sy1 = texture(uTerr, uv + vec2(0, tx.y)), sy0 = texture(uTerr, uv - vec2(0, tx.y));
  vec2 grad = vec2(sx1.r - sx0.r, sy1.r - sy0.r) + vec2(sx1.g - sx0.g, sy1.g - sy0.g) * 1.5;
  vec2 n = -normalize(grad + vec2(0.0, 1e-4));    // outward normal
  float up = clamp(-n.y, 0.0, 1.0);
  float edge = 1.0 - smoothstep(0.0, 0.3, inner);

  float d = w.y - surfaceY(w.x);
  float depth = max(d, 0.0);
  float f = fbm(w * 0.005);
  float g = fbm(w * 0.022 + 7.0);
  float fine = vnoise(w * 0.11);
  // Cracks: ridged noise gives dark veins through the stone.
  float ridge = 1.0 - abs(fbm(w * 0.012 + 3.0) * 2.0 - 1.0);
  float crack = smoothstep(0.88, 0.97, ridge);
  vec3 base = mix(uRockA, uRockB, smoothstep(0.3, 0.7, f));
  base *= 0.62 + 0.55 * g + 0.12 * fine;
  base *= 1.0 - 0.45 * crack;
  // Light comes from above: surfaces facing up are lit, overhangs fall into shadow.
  float light = mix(0.55, 1.15, up) * mix(1.0, 0.75, clamp(n.y, 0.0, 1.0));
  vec3 c = base * mix(light, 0.18, smoothstep(0.0, 0.9, inner));
  // Living crust (coral / algae / moss) only on top faces, broken up by noise.
  float crustMask = edge * smoothstep(0.35, 0.8, up) * smoothstep(0.38, 0.62, fbm(w * 0.035 + 11.0));
  vec3 crust = mix(uRockTop, uRockTop.gbr * 0.9 + 0.05, smoothstep(0.3, 0.7, fbm(w * 0.02 + 5.0)));
  crust *= 0.7 + 0.5 * vnoise(w * 0.18);
  c = mix(c, crust, crustMask * 0.85);
  // Back-scattered water light at the very edge ties the rock into the water.
  vec3 fogc = waterColor(depth);
  float rim = 1.0 - smoothstep(0.0, 0.07, inner);
  c += fogc * rim * 0.55 * step(0.0, d);
  float speck = smoothstep(0.86, 0.9, vnoise(w * 0.08)) * edge;
  c += uRockGlow * speck * (0.6 + 0.4 * sin(uTime * 2.0 + w.x * 0.1));
  c += vec3(0.55, 0.85, 1.0) * caustics(w * 0.009, uTime * 0.55) * edge * (0.25 + 0.75 * up)
       * exp(-depth / uCausticDepth) * uCausticAmt * 0.8 * step(0.0, d);
  // Distance haze: deep interiors fade toward the water colour so silhouettes stay soft.
  c = mix(c, fogc * 0.35, (0.25 + 0.5 * smoothstep(0.2, 1.0, inner)) * step(0.0, d) * 0.7);
  o = vec4(c * a, a);
}
`;

export const SPRITE_VS = HEAD + `
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aCol;
uniform vec4 uCam;
uniform float uParallax;
out vec2 vUV;
out vec4 vCol;
out vec2 vW;
void main() {
  vec2 s = aPos - uCam.xy * uParallax;
  vW = aPos;
  vUV = aUV;
  vCol = aCol;
  gl_Position = vec4(s.x / uCam.z, -s.y / uCam.w, 0.0, 1.0);
}
`;

export const SPRITE_FS = HEAD + WATER + `
in vec2 vUV;
in vec4 vCol;
in vec2 vW;
out vec4 o;
uniform sampler2D uTex;
uniform float uFog;
void main() {
  vec4 t = texture(uTex, vUV) * vCol;
  float d = vW.y - surfaceY(vW.x);
  if (uFog > 0.0 && d > 0.0) {
    vec3 fogc = waterColor(d);
    t.rgb = mix(t.rgb, fogc * t.a, uFog);
  }
  o = t;
}
`;

// Underwater distortion, light, caustic shimmer, the surface line and sonar ripples.
export const WORLDFX_FS = HEAD + WATER + NOISE + `
in vec2 vUV;
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uLight;
uniform vec4 uRings[6];       // x, y, radius, strength
uniform float uWobble;
uniform float uAmbDeep;
uniform vec2 uDark;           // depth where darkness starts, depth where it is complete
uniform float uCausticDepth;
uniform float uShimmer;
void main() {
  vec2 w = worldAt(vUV);
  float d = w.y - surfaceY(w.x);
  float under = smoothstep(-1.5, 1.5, d);
  vec2 off = vec2(sin(w.y * 0.031 + uTime * 1.7) + 0.5 * sin(w.y * 0.073 - uTime * 1.1),
                  cos(w.x * 0.027 + uTime * 1.3)) * 0.0011 * under * uWobble;
  float ring = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 r = uRings[i];
    if (r.w <= 0.0) continue;
    vec2 dv = w - r.xy;
    float dist = length(dv);
    float k = r.w * exp(-pow((dist - r.z) / 16.0, 2.0));
    off += dv / max(dist, 1.0) * k * 0.006 * vec2(1.0, -1.0) * vec2(uCam.w / uCam.z, 1.0);
    ring += k;
  }
  vec2 uv = vUV + off;
  vec3 c = texture(uScene, uv).rgb;
  vec3 L = texture(uLight, uv).rgb;
  float amb = mix(1.0, uAmbDeep, smoothstep(uDark.x, uDark.y, max(d, 0.0)));
  c = c * (amb + L * (1.15 - amb)) + L * 0.10 * under;
  float cf = exp(-max(d, 0.0) / uCausticDepth) * under;
  c *= 1.0 + caustics(w * 0.0085, uTime * 0.45) * 0.1 * cf * uShimmer;
  // Surface: a bright meniscus line and the mirror-like underside just below it.
  c += vec3(0.85, 0.97, 1.0) * exp(-abs(d) / 1.4) * 0.7;
  c += uShallow * 0.16 * exp(-max(d, 0.0) / 18.0) * under * amb;
  c += vec3(0.45, 0.85, 1.0) * ring * 0.45;
  o = vec4(c, 1.0);
}
`;

export const BRIGHT_FS = HEAD + `
in vec2 vUV;
out vec4 o;
uniform sampler2D uTex;
uniform float uThreshold;
void main() {
  vec2 px = 1.0 / vec2(textureSize(uTex, 0));
  vec3 c = (texture(uTex, vUV + px * vec2(-0.5, -0.5)).rgb + texture(uTex, vUV + px * vec2(0.5, -0.5)).rgb +
            texture(uTex, vUV + px * vec2(-0.5, 0.5)).rgb + texture(uTex, vUV + px * vec2(0.5, 0.5)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(uThreshold, uThreshold + 0.35, l), 1.0);
}
`;

export const BLUR_FS = HEAD + `
in vec2 vUV;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec2 px = uDir / vec2(textureSize(uTex, 0));
  vec3 c = texture(uTex, vUV).rgb * 0.2270270270;
  c += (texture(uTex, vUV + px * 1.3846153846).rgb + texture(uTex, vUV - px * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uTex, vUV + px * 3.2307692308).rgb + texture(uTex, vUV - px * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}
`;

export const COMPOSITE_FS = HEAD + `
in vec2 vUV;
out vec4 o;
uniform sampler2D uTex;
uniform sampler2D uBloom;
uniform sampler2D uBloom2;
uniform float uBloomAmt;
uniform float uExposure;
uniform float uFade;
uniform float uTime;
uniform vec3 uGrade;      // per-channel colour grade
uniform float uFlash;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 c2 = vUV - 0.5;
  float r2 = dot(c2, c2);
  vec2 ca = c2 * r2 * 0.012;
  vec3 c;
  c.r = texture(uTex, vUV - ca).r;
  c.g = texture(uTex, vUV).g;
  c.b = texture(uTex, vUV + ca).b;
  c += (texture(uBloom, vUV).rgb * 0.6 + texture(uBloom2, vUV).rgb * 0.8) * uBloomAmt;
  c *= uGrade;
  c = aces(c * uExposure);
  c = pow(c, vec3(0.94));
  c *= 1.0 - smoothstep(0.18, 0.75, r2) * 0.55;
  float grain = fract(sin(dot(vUV * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c += grain * 0.018;
  c = mix(c, vec3(1.0), uFlash);
  o = vec4(c * (1.0 - uFade), 1.0);
}
`;
