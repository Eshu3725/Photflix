import exifr from 'exifr';
import { analyze, renderJpeg } from './canvas';
import { getOriginal, putAlbum, putItems, putOriginal } from './db';
import { yearOf } from './format';
import { guessGenre, pickTagline, tidyTitle } from './genre';
import { generatePoster, POSTER_STYLES } from './poster';
import { sceneSeconds } from './scenes';
import { hash } from './format';
import type { Album, ImportSource, MediaItem, SourceKind } from './types';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

/** Films longer than this are sampled evenly so they stay watchable (and storable). */
export const MAX_ITEMS = 300;
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const FULL_EDGE = 1920;
const THUMB_EDGE = 640;

export function mediaKind(name: string, type = ''): 'photo' | 'video' | null {
  if (type.startsWith('image/') || IMAGE_EXT.test(name)) return 'photo';
  if (type.startsWith('video/') || VIDEO_EXT.test(name)) return 'video';
  return null;
}

/** Evenly samples a list down to `max` entries, keeping order. */
export function sample<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, i) => list[Math.floor((i * list.length) / max)]);
}

interface Processed {
  kind: 'photo' | 'video';
  original: Blob;
  thumb: Blob;
  width: number;
  height: number;
  duration?: number;
  score: number;
  color: string;
  exifDate?: number;
}

async function processPhoto(file: File): Promise<Processed> {
  const bmp = await createImageBitmap(file);
  try {
    const { width, height } = bmp;
    // Small JPEGs are kept byte-for-byte; everything else is normalised to a 1080p-class JPEG.
    const original =
      file.type === 'image/jpeg' && Math.max(width, height) <= FULL_EDGE
        ? file.slice(0, file.size, file.type)
        : await renderJpeg(bmp, width, height, FULL_EDGE, 0.86);
    const thumb = await renderJpeg(bmp, width, height, THUMB_EDGE, 0.8);
    let exifDate: number | undefined;
    try {
      const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
      const d: unknown = meta?.DateTimeOriginal ?? meta?.CreateDate;
      if (d instanceof Date && !isNaN(d.getTime())) exifDate = d.getTime();
    } catch {
      // No readable EXIF: fall back to the file date.
    }
    return { kind: 'photo', original, thumb, width, height, exifDate, ...analyze(bmp) };
  } finally {
    bmp.close();
  }
}

function processVideo(file: File): Promise<Processed> {
  if (file.size > MAX_VIDEO_BYTES) return Promise.reject(new Error('Video too large'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const timer = setTimeout(() => finish(new Error('Video timed out')), 10000);
    function finish(result: Processed | Error) {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (result instanceof Error) reject(result);
      else resolve(result);
    }
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onerror = () => finish(new Error('Unsupported video'));
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    };
    video.onseeked = async () => {
      try {
        const { videoWidth: width, videoHeight: height } = video;
        if (!width || !height) throw new Error('Video has no picture');
        const thumb = await renderJpeg(video, width, height, THUMB_EDGE, 0.8);
        finish({
          kind: 'video',
          original: file.slice(0, file.size, file.type || 'video/mp4'),
          thumb,
          width,
          height,
          duration: isFinite(video.duration) ? video.duration : undefined,
          ...analyze(video),
        });
      } catch (e) {
        finish(e instanceof Error ? e : new Error('Video failed'));
      }
    };
    video.src = url;
  });
}

export interface ImportProgress {
  done: number;
  total: number;
  stage: 'frames' | 'poster';
}

export interface ImportResult {
  album: Album;
  skipped: number;
}

export async function importAlbum(opts: {
  title: string;
  source: SourceKind;
  entries: ImportSource[];
  onProgress?: (p: ImportProgress) => void;
}): Promise<ImportResult> {
  const albumId = crypto.randomUUID();
  const entries = opts.entries;
  const metas: MediaItem[] = [];
  let done = 0;
  let skipped = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      try {
        const file = await entry.getFile();
        const kind = mediaKind(file.name || entry.name, file.type);
        if (!kind) throw new Error('Not a photo or video');
        const p = kind === 'photo' ? await processPhoto(file) : await processVideo(file);
        const id = crypto.randomUUID();
        await putOriginal(id, p.original);
        metas.push({
          id,
          albumId,
          order: 0,
          kind: p.kind,
          name: entry.name,
          takenAt: entry.takenAt ?? p.exifDate ?? (file.lastModified || Date.now()),
          width: p.width,
          height: p.height,
          duration: p.duration,
          thumb: p.thumb,
          score: p.score,
          color: p.color,
        });
      } catch {
        skipped++;
      }
      opts.onProgress?.({ done: ++done, total: entries.length, stage: 'frames' });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));

  if (!metas.length) throw new Error('None of these files could be read as photos or videos.');

  metas.sort((a, b) => a.takenAt - b.takenAt || a.name.localeCompare(b.name, undefined, { numeric: true }));
  metas.forEach((m, i) => (m.order = i));
  await putItems(metas);

  opts.onProgress?.({ done, total: entries.length, stage: 'poster' });

  const byScore = (a: MediaItem, b: MediaItem) => b.score - a.score;
  const photos = metas.filter((m) => m.kind === 'photo');
  const cover = [...(photos.length ? photos : metas)].sort(byScore)[0];
  const wide = photos.filter((m) => m.width >= m.height * 1.2);
  const backdropIds = [...(wide.length ? wide : photos)].sort(byScore).slice(0, 5).map((m) => m.id);

  const title = tidyTitle(opts.title);
  const genre = guessGenre(title);
  const posterStyle = hash(title) % POSTER_STYLES.length;
  const coverBlob = cover.kind === 'photo' ? ((await getOriginal(cover.id)) ?? cover.thumb) : cover.thumb;
  const dateStart = metas[0].takenAt;
  const poster = await generatePoster({
    cover: coverBlob,
    title,
    genre,
    year: yearOf(dateStart),
    count: metas.length,
    style: posterStyle,
    accent: cover.color,
  });

  const album: Album = {
    id: albumId,
    title,
    tagline: pickTagline(title, genre),
    genre,
    source: opts.source,
    createdAt: Date.now(),
    dateStart,
    dateEnd: metas[metas.length - 1].takenAt,
    itemCount: metas.length,
    runtimeSec: metas.reduce((sum, m) => sum + sceneSeconds(m), 0),
    coverId: cover.id,
    backdropIds,
    poster,
    posterRev: 0,
    posterStyle,
    accent: cover.color,
    inList: false,
  };
  await putAlbum(album);
  return { album, skipped };
}

// ---------- Turning picked files / folders into album drafts ----------

export interface Draft {
  id: string;
  name: string;
  files: File[];
  /** How many media files the folder really had, before sampling. */
  found: number;
}

interface PathedFile {
  file: File;
  path: string;
}

/** Each folder that directly contains media becomes one draft. */
export function groupIntoDrafts(files: PathedFile[], fallbackName: string): Draft[] {
  const groups = new Map<string, File[]>();
  for (const { file, path } of files) {
    if (!mediaKind(file.name, file.type)) continue;
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(file);
  }
  return [...groups.entries()]
    .map(([dir, list]) => {
      const sorted = list.sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name));
      return {
        id: crypto.randomUUID(),
        name: tidyTitle(dir.split('/').filter(Boolean).pop() ?? fallbackName),
        files: sample(sorted, MAX_ITEMS),
        found: sorted.length,
      };
    })
    .sort((a, b) => b.found - a.found);
}

export const fromFileInput = (list: FileList): PathedFile[] =>
  [...list].map((file) => ({ file, path: file.webkitRelativePath || file.name }));

/** Walks dropped folders (and loose files) from a drag-and-drop. */
export async function fromDrop(data: DataTransfer): Promise<PathedFile[]> {
  const out: PathedFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns results in batches; keep reading until it comes back empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };
  const roots = [...data.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!roots.length) return [...data.files].map((file) => ({ file, path: file.name }));
  for (const root of roots) await walk(root, '').catch(() => {});
  return out;
}

export const filesToSources = (files: File[]): ImportSource[] =>
  files.map((file) => ({ name: file.name, getFile: async () => file }));
