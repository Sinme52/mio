// Procedurally drawn textures for effects that do not need painted art.
import { texture } from './gl.js';
import { rng } from './util.js';

function canvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  return c;
}

export function makeTextures(gl) {
  const T = {};
  const add = (name, c, opts) => { T[name] = texture(gl, c, opts); };

  add('white', canvas(4, 4, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4); }));

  // Soft gaussian-like glow.
  add('glow', canvas(128, 128, (g, w) => {
    const img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5) / w * 2 - 1, dy = (y + 0.5) / w * 2 - 1;
      const r2 = dx * dx + dy * dy;
      const a = Math.max(0, Math.exp(-r2 * 4.5) - 0.011) / 0.989;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
  }));

  // Hard-edged dot for small particles.
  add('dot', canvas(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  }));

  add('ring', canvas(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 96, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }));

  // Strand texture: bright core across u, uniform along v.
  add('line', canvas(32, 8, (g) => {
    const gr = g.createLinearGradient(0, 0, 32, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 8);
  }));

  // Kelp ribbon: wavy blade with a central stipe and leaf lobes, drawn white to be tinted.
  add('kelp', canvas(64, 512, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let y = 0; y < h; y += 2) {
      const lobe = 0.55 + 0.45 * Math.abs(Math.sin(y * 0.045 + r() * 0.2));
      const half = (w / 2 - 4) * lobe;
      const shade = 200 + Math.round(55 * Math.sin(y * 0.09));
      g.fillStyle = `rgba(${shade},${shade},${shade},0.9)`;
      g.fillRect(w / 2 - half, y, half * 2, 2);
    }
    g.fillStyle = 'rgba(255,255,255,1)';
    g.fillRect(w / 2 - 2, 0, 4, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }), { wrapT: gl.REPEAT });

  // Jellyfish bell: translucent dome with a bright rim and inner organs.
  add('bell', canvas(256, 192, (g) => {
    g.translate(128, 150);
    const dome = () => { g.beginPath(); g.ellipse(0, 0, 112, 130, 0, Math.PI, 0); g.quadraticCurveTo(60, 22, 0, 18); g.quadraticCurveTo(-60, 22, -112, 0); };
    let gr = g.createRadialGradient(0, -40, 10, 0, -20, 140);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0.08)');
    dome(); g.fillStyle = gr; g.fill();
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.85)'; dome(); g.stroke();
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(-48 + i * 32, -38, 13, 20, 0, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 4; g.stroke();
    }
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(i * 18, 10); g.quadraticCurveTo(i * 14, -70, 0, -122); g.stroke(); }
  }));

  add('bubble', canvas(64, 64, (g) => {
    let gr = g.createRadialGradient(32, 32, 18, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,0.05)');
    gr.addColorStop(0.8, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.ellipse(23, 22, 7, 4, -0.7, 0, Math.PI * 2); g.fill();
  }));

  add('star', canvas(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 29, 64, 6); g.fillRect(29, 0, 6, 64);
    g.beginPath(); g.arc(32, 32, 10, 0, Math.PI * 2); g.fill();
  }));

  // Dark sphere of silence that imprisons a pod member.
  add('orb', canvas(256, 256, (g) => {
    let gr = g.createRadialGradient(128, 128, 20, 128, 128, 126);
    gr.addColorStop(0, 'rgba(10,0,25,0.92)');
    gr.addColorStop(0.75, 'rgba(25,8,50,0.85)');
    gr.addColorStop(0.92, 'rgba(150,90,220,0.75)');
    gr.addColorStop(1, 'rgba(150,90,220,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(180,140,255,0.35)';
    for (let i = 0; i < 7; i++) {
      g.lineWidth = 3; g.beginPath();
      g.arc(128, 128, 40 + i * 11, i * 0.9, i * 0.9 + 1.6); g.stroke();
    }
  }));

  // Pearl: lustrous sphere.
  add('pearl', canvas(64, 64, (g) => {
    const gr = g.createRadialGradient(24, 22, 2, 32, 32, 28);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#f4eef8'); gr.addColorStop(0.85, '#c9c0e0'); gr.addColorStop(1, 'rgba(160,150,200,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  }));

  return T;
}
