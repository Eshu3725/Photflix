import { canvasToBlob, makeCanvas } from './canvas';
import type { ImportSource } from './types';

// Procedurally painted landscapes so the app can be tried without any photos.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Palette {
  sky: [string, string, string];
  sun: string;
  ridges: string[];
  stars?: boolean;
}

const PALETTES: Record<string, Palette[]> = {
  coast: [
    { sky: ['#12355b', '#f08a4b', '#ffd27d'], sun: '#fff1c1', ridges: ['#c9684a', '#8a3f4a', '#4a2545', '#1f1630'] },
    { sky: ['#3a7bd5', '#8fd3f4', '#fdf6d8'], sun: '#ffffff', ridges: ['#5fb8a8', '#2f8f8a', '#17606b', '#0c3b4a'] },
    { sky: ['#f76b1c', '#fad961', '#fff3c4'], sun: '#fffbe8', ridges: ['#e0553a', '#a8323e', '#63203f', '#2a1230'] },
  ],
  festival: [
    { sky: ['#1a0b2e', '#5b1a6b', '#f0502f'], sun: '#ffd166', ridges: ['#7a1f5c', '#4b1450', '#2a0d3a', '#12061f'], stars: true },
    { sky: ['#0b1026', '#2b1a55', '#b83280'], sun: '#ffe29a', ridges: ['#5a2a82', '#38196b', '#1e0f47', '#0c0624'], stars: true },
    { sky: ['#220a1a', '#8a1c3b', '#ffb224'], sun: '#fff0b8', ridges: ['#a3283a', '#6b1638', '#3d0d2c', '#1a0616'], stars: true },
  ],
  hills: [
    { sky: ['#5c7c8a', '#a8c5b5', '#e8efd8'], sun: '#ffffff', ridges: ['#7fa88a', '#4f8068', '#2c5a4a', '#143328'] },
    { sky: ['#2c3e50', '#6a8a82', '#c8d8b8'], sun: '#f4f8e8', ridges: ['#5a8a6a', '#386a50', '#1e4a3a', '#0c2a22'] },
    { sky: ['#8ea6b4', '#d8e2dc', '#fbf3d8'], sun: '#fffdf0', ridges: ['#94b49a', '#628c72', '#38644e', '#183a2e'] },
  ],
};

function paint(w: number, h: number, seed: number, p: Palette) {
  const { canvas, ctx } = makeCanvas(w, h);
  const r = rng(seed);

  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  sky.addColorStop(0, p.sky[0]);
  sky.addColorStop(0.6, p.sky[1]);
  sky.addColorStop(1, p.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (p.stars) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 160; i++) {
      const s = r() * 2.2 + 0.4;
      ctx.globalAlpha = 0.3 + r() * 0.7;
      ctx.fillRect(r() * w, r() * h * 0.55, s, s);
    }
    ctx.globalAlpha = 1;
  }

  const sx = w * (0.2 + r() * 0.6);
  const sy = h * (0.3 + r() * 0.25);
  const sr = Math.min(w, h) * (0.06 + r() * 0.05);
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 6);
  glow.addColorStop(0, 'rgba(255,240,200,.75)');
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = p.sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  p.ridges.forEach((colour, layer) => {
    const base = h * (0.5 + layer * 0.12);
    const amp = h * (0.13 - layer * 0.02);
    const f1 = 1 + r() * 2;
    const f2 = 3 + r() * 4;
    const f3 = 9 + r() * 8;
    const ph = r() * 10;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const t = (x / w) * Math.PI * 2;
      const y = base - amp * (0.6 * Math.sin(t * f1 + ph) + 0.3 * Math.sin(t * f2 + ph * 2) + 0.1 * Math.sin(t * f3 + ph * 3));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  });

  // A little haze so the layers read as depth rather than flat shapes.
  const haze = ctx.createLinearGradient(0, h * 0.45, 0, h);
  haze.addColorStop(0, 'rgba(255,255,255,.12)');
  haze.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

const SAMPLES = [
  { title: 'Coastline Road Trip', palette: 'coast', seed: 11, from: Date.UTC(2025, 11, 26, 9) },
  { title: 'Diwali Night at Home', palette: 'festival', seed: 47, from: Date.UTC(2026, 10, 8, 13) },
  { title: 'Monsoon in the Hills', palette: 'hills', seed: 83, from: Date.UTC(2026, 6, 18, 6) },
];

const PER_ALBUM = 12;
const HOUR = 3600 * 1000;

export function sampleDrafts(): { title: string; entries: ImportSource[] }[] {
  return SAMPLES.map((s) => ({
    title: s.title,
    entries: Array.from({ length: PER_ALBUM }, (_, i) => {
      const portrait = i % 5 === 3;
      const name = `${s.palette}-${String(i + 1).padStart(2, '0')}.jpg`;
      // Spread across three days so the film gets chapters.
      const takenAt = s.from + Math.floor(i / 4) * 24 * HOUR + (i % 4) * 2 * HOUR;
      return {
        name,
        takenAt,
        getFile: async () => {
          const palettes = PALETTES[s.palette];
          const canvas = paint(portrait ? 1000 : 1600, portrait ? 1500 : 1000, s.seed * 100 + i, palettes[i % palettes.length]);
          const blob = await canvasToBlob(canvas, 0.9);
          return new File([blob], name, { type: 'image/jpeg', lastModified: takenAt });
        },
      };
    }),
  }));
}
