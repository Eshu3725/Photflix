import { canvasToBlob, makeCanvas } from './canvas';
import type { Genre } from './types';

const W = 600;
const H = 900;
const CREAM = '#f4ede2';

export const POSTER_STYLES = ['Marquee', 'Festival', 'Indie'] as const;

export const FONT_EPIC = "'Anton', Impact, sans-serif";
export const FONT_DISPLAY = "'Fraunces Variable', Georgia, serif";
export const FONT_UI = "'Outfit Variable', system-ui, sans-serif";

export interface PosterInput {
  cover: Blob;
  title: string;
  genre: Genre;
  year: number;
  count: number;
  style: number;
  accent: string;
}

type Ctx = CanvasRenderingContext2D;

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size at which the text wraps into `maxLines` within `maxWidth`. */
function fit(ctx: Ctx, text: string, font: (px: number) => string, maxWidth: number, maxLines: number, maxPx: number, minPx: number) {
  for (let px = maxPx; px >= minPx; px -= 4) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { px, lines };
  }
  ctx.font = font(minPx);
  return { px: minPx, lines: wrap(ctx, text, maxWidth).slice(0, maxLines) };
}

function tracked(ctx: Ctx, text: string, x: number, y: number, spacing: number) {
  ctx.letterSpacing = `${spacing}px`;
  // Canvas adds tracking after the last glyph too; nudge centred text back.
  ctx.fillText(text, ctx.textAlign === 'center' ? x + spacing / 2 : x, y);
  ctx.letterSpacing = '0px';
}

function shade(ctx: Ctx, stops: [number, number][], from = 0, to = H) {
  const g = ctx.createLinearGradient(0, from, 0, to);
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(8,6,5,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function grain(ctx: Ctx) {
  const size = 160;
  const { canvas, ctx: n } = makeCanvas(size, size);
  const img = n.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 16;
  }
  n.putImageData(img, 0, 0);
  ctx.fillStyle = ctx.createPattern(canvas, 'repeat')!;
  ctx.fillRect(0, 0, W, H);
}

async function loadFonts(title: string) {
  if (!document.fonts) return;
  await Promise.allSettled([
    document.fonts.load(`400 80px ${FONT_EPIC}`, title.toUpperCase()),
    document.fonts.load(`italic 500 80px ${FONT_DISPLAY}`, title),
    document.fonts.load(`800 80px ${FONT_UI}`, title.toLowerCase()),
    document.fonts.load(`500 16px ${FONT_UI}`, 'A FILM BY YOU 0123456789'),
  ]);
}

export async function generatePoster(input: PosterInput): Promise<Blob> {
  const { title, accent } = input;
  const style = ((input.style % POSTER_STYLES.length) + POSTER_STYLES.length) % POSTER_STYLES.length;
  await loadFonts(title);
  const bmp = await createImageBitmap(input.cover);
  const { canvas, ctx } = makeCanvas(W, H);

  // Cover-fit, biased slightly upward: faces tend to sit above centre.
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const dw = bmp.width * scale;
  const dh = bmp.height * scale;
  ctx.drawImage(bmp, (W - dw) / 2, (H - dh) * 0.4, dw, dh);
  bmp.close();

  // Gentle grade toward the album's own accent so each poster has a mood.
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  const credits = `A FILM BY YOU  ·  ${input.count} MOMENT${input.count === 1 ? '' : 'S'}  ·  ${input.year}`;
  ctx.textBaseline = 'alphabetic';

  if (style === 0) {
    // Marquee: tall condensed caps anchored to the bottom.
    shade(ctx, [[0, 0.35], [0.25, 0], [0.5, 0.1], [0.78, 0.82], [1, 0.96]]);
    grain(ctx);
    ctx.textAlign = 'center';
    const t = fit(ctx, title.toUpperCase(), (px) => `400 ${px}px ${FONT_EPIC}`, 510, 3, 128, 44);
    const lh = t.px * 1.06;
    let y = 790 - (t.lines.length - 1) * lh;
    ctx.fillStyle = accent;
    ctx.font = `600 17px ${FONT_UI}`;
    tracked(ctx, 'A PHOTFLIX PREMIERE', W / 2, y - t.px - 14, 6);
    ctx.fillStyle = CREAM;
    ctx.font = `400 ${t.px}px ${FONT_EPIC}`;
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 24;
    for (const line of t.lines) {
      ctx.fillText(line, W / 2, y);
      y += lh;
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(244,237,226,.3)';
    ctx.fillRect(W / 2 - 150, 818, 300, 1);
    ctx.fillStyle = 'rgba(244,237,226,.72)';
    ctx.font = `500 15px ${FONT_UI}`;
    tracked(ctx, credits, W / 2, 852, 3);
  } else if (style === 1) {
    // Festival: italic serif, centred, quiet.
    shade(ctx, [[0, 0.5], [0.22, 0.05], [0.45, 0.15], [0.75, 0.78], [1, 0.94]]);
    grain(ctx);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,237,226,.85)';
    ctx.font = `500 16px ${FONT_UI}`;
    tracked(ctx, 'OFFICIAL SELECTION', W / 2, 64, 7);
    ctx.fillStyle = accent;
    tracked(ctx, 'YOUR CAMERA ROLL', W / 2, 88, 7);
    const t = fit(ctx, title, (px) => `italic 500 ${px}px ${FONT_DISPLAY}`, 500, 3, 96, 40);
    const lh = t.px * 1.08;
    let y = 770 - (t.lines.length - 1) * lh;
    ctx.fillStyle = CREAM;
    ctx.font = `italic 500 ${t.px}px ${FONT_DISPLAY}`;
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 28;
    for (const line of t.lines) {
      ctx.fillText(line, W / 2, y);
      y += lh;
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.font = `600 17px ${FONT_UI}`;
    tracked(ctx, `${input.genre.toUpperCase()}  ·  ${input.year}`, W / 2, 822, 5);
    ctx.fillStyle = 'rgba(244,237,226,.6)';
    ctx.font = `500 14px ${FONT_UI}`;
    tracked(ctx, `A FILM BY YOU  ·  ${input.count} MOMENTS`, W / 2, 854, 3);
  } else {
    // Indie: heavy lowercase stacked in the top-left corner.
    shade(ctx, [[0, 0.86], [0.42, 0.3], [0.62, 0.05], [0.85, 0.6], [1, 0.9]]);
    grain(ctx);
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.fillRect(44, 54, 56, 7);
    const t = fit(ctx, title.toLowerCase(), (px) => `800 ${px}px ${FONT_UI}`, 512, 4, 104, 40);
    const lh = t.px * 0.98;
    let y = 84 + t.px * 0.82;
    ctx.fillStyle = CREAM;
    ctx.font = `800 ${t.px}px ${FONT_UI}`;
    ctx.letterSpacing = `${-t.px * 0.03}px`;
    for (const line of t.lines) {
      ctx.fillText(line, 42, y);
      y += lh;
    }
    ctx.letterSpacing = '0px';
    ctx.fillStyle = accent;
    ctx.font = `600 17px ${FONT_UI}`;
    tracked(ctx, `${input.genre.toUpperCase()} — ${input.year}`, 44, 820, 4);
    ctx.fillStyle = 'rgba(244,237,226,.7)';
    ctx.font = `500 14px ${FONT_UI}`;
    tracked(ctx, `A FILM BY YOU  ·  ${input.count} MOMENTS`, 44, 852, 3);
  }

  return canvasToBlob(canvas, 0.9);
}
