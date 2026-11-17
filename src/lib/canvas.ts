export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality),
  );
}

type Drawable = ImageBitmap | HTMLVideoElement | HTMLCanvasElement;

/** Scales so the longest edge is at most `maxEdge`, then encodes as JPEG. */
export function renderJpeg(src: Drawable, w: number, h: number, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const { canvas, ctx } = makeCanvas(w * scale, h * scale);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, quality);
}

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60 + 360) % 360) / 360;
}

/**
 * Cheap "is this a good cover?" heuristic: colourful, contrasty, well exposed.
 * Also returns a vivid accent colour pulled from the most saturated pixels.
 */
export function analyze(src: Drawable): { score: number; color: string } {
  const N = 32;
  const { ctx } = makeCanvas(N, N);
  ctx.drawImage(src, 0, 0, N, N);
  const { data } = ctx.getImageData(0, 0, N, N);
  const n = N * N;

  let sumL = 0, sumL2 = 0, sumRg = 0, sumRg2 = 0, sumYb = 0, sumYb2 = 0;
  let wr = 0, wg = 0, wb = 0, wsum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumL += l; sumL2 += l * l;
    sumRg += rg; sumRg2 += rg * rg;
    sumYb += yb; sumYb2 += yb * yb;
    const max = Math.max(r, g, b);
    const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    const w = sat * sat * (max / 255);
    wr += r * w; wg += g * w; wb += b * w; wsum += w;
  }
  const meanL = sumL / n;
  const contrast = Math.sqrt(Math.max(0, sumL2 / n - meanL * meanL));
  const mRg = sumRg / n, mYb = sumYb / n;
  const sRg = Math.sqrt(Math.max(0, sumRg2 / n - mRg * mRg));
  const sYb = Math.sqrt(Math.max(0, sumYb2 / n - mYb * mYb));
  const colourfulness = Math.sqrt(sRg * sRg + sYb * sYb) + 0.3 * Math.sqrt(mRg * mRg + mYb * mYb);
  const score = colourfulness * 0.6 + contrast * 0.8 - Math.abs(meanL - 125) * 0.3;

  // Near-greyscale images have no meaningful hue; fall back to the house amber.
  let color = '#ffb224';
  if (wsum > n * 0.004) {
    const hue = hueOf(wr / wsum, wg / wsum, wb / wsum);
    color = toHex(...hslToRgb(hue, 0.78, 0.64));
  }
  return { score, color };
}
