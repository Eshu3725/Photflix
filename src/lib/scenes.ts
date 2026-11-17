import { dayLabel, monthLabel } from './format';
import type { MediaItem } from './types';

/** Seconds each still photo stays on screen at 1x. */
export const PHOTO_SEC = 5;

export const sceneSeconds = (item: Pick<MediaItem, 'kind' | 'duration'>) =>
  item.kind === 'video' ? Math.max(1, item.duration ?? 8) : PHOTO_SEC;

export interface Chapter {
  n: number;
  /** e.g. "Sat, 14 Mar 2024" */
  label: string;
  start: number;
  count: number;
}

/** Splits a film into chapters by day, or by month when it spans many days. */
export function chaptersOf(items: MediaItem[]): Chapter[] {
  const dayKey = (t: number) => new Date(t).toDateString();
  const days = new Set(items.map((i) => dayKey(i.takenAt)));
  const byMonth = days.size > 14;
  const key = byMonth ? (t: number) => monthLabel(t) : dayKey;
  const label = byMonth ? monthLabel : dayLabel;

  const chapters: Chapter[] = [];
  let current = '';
  items.forEach((item, index) => {
    const k = key(item.takenAt);
    if (k !== current) {
      current = k;
      chapters.push({ n: chapters.length + 1, label: label(item.takenAt), start: index, count: 0 });
    }
    chapters[chapters.length - 1].count++;
  });
  return chapters;
}
