import { useEffect, useState } from 'react';
import { getOriginal } from './db';
import type { Album, MediaItem } from './types';

// Blobs read back from IndexedDB are new objects every time, so object URLs are
// cached by a stable key rather than by blob identity.
const keyed = new Map<string, string>();

export function keyedUrl(key: string, blob: Blob): string {
  let url = keyed.get(key);
  if (!url) {
    url = URL.createObjectURL(blob);
    keyed.set(key, url);
  }
  return url;
}

export function dropKeyedUrls(prefix: string) {
  for (const [key, url] of keyed) {
    if (key.startsWith(prefix)) {
      URL.revokeObjectURL(url);
      keyed.delete(key);
    }
  }
}

export const posterUrl = (album: Album) => keyedUrl(`poster:${album.id}:${album.posterRev}`, album.poster);
export const thumbUrl = (item: MediaItem) => keyedUrl(`thumb:${item.id}`, item.thumb);

// Full-resolution media, loaded on demand.
const pending = new Map<string, Promise<string>>();
const resolved = new Map<string, string>();

export function originalUrl(id: string): Promise<string> {
  let p = pending.get(id);
  if (!p) {
    p = getOriginal(id).then((blob) => {
      if (!blob) throw new Error('Missing media');
      const url = URL.createObjectURL(blob);
      resolved.set(id, url);
      return url;
    });
    p.catch(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

export function releaseOriginals(ids: Iterable<string>) {
  for (const id of ids) {
    const url = resolved.get(id);
    if (url) URL.revokeObjectURL(url);
    resolved.delete(id);
    pending.delete(id);
  }
}

export function useOriginal(id: string | undefined): string | undefined {
  const [url, setUrl] = useState(() => (id ? resolved.get(id) : undefined));
  useEffect(() => {
    if (!id) return setUrl(undefined);
    setUrl(resolved.get(id));
    let live = true;
    originalUrl(id).then(
      (u) => live && setUrl(u),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}
