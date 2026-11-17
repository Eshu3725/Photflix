export type SourceKind = 'device' | 'google' | 'sample';

export const GENRES = [
  'Adventure',
  'Romance',
  'Celebration',
  'Family',
  'Nature',
  'City',
  'Slice of Life',
] as const;
export type Genre = (typeof GENRES)[number];

/** One imported album, presented as a film. */
export interface Album {
  id: string;
  title: string;
  tagline: string;
  genre: Genre;
  source: SourceKind;
  createdAt: number;
  dateStart: number;
  dateEnd: number;
  itemCount: number;
  runtimeSec: number;
  coverId: string;
  /** Photo ids used for wide hero artwork. May be empty for video-only albums. */
  backdropIds: string[];
  poster: Blob;
  posterRev: number;
  posterStyle: number;
  accent: string;
  inList: boolean;
  progress?: { index: number; updatedAt: number; done: boolean };
  soundtrack?: { name: string; blob: Blob };
}

export interface MediaItem {
  id: string;
  albumId: string;
  order: number;
  kind: 'photo' | 'video';
  name: string;
  takenAt: number;
  width: number;
  height: number;
  /** Seconds, videos only. */
  duration?: number;
  thumb: Blob;
  /** Visual-interest score used to pick covers. */
  score: number;
  /** Vivid representative colour, hex. */
  color: string;
}

/** A not-yet-imported media file. `getFile` may download. */
export interface ImportSource {
  name: string;
  takenAt?: number;
  getFile: () => Promise<File>;
}
