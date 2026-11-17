import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deleteAlbum, getOriginal, listAlbums, listItems, putAlbum, sweepOrphans } from '../lib/db';
import { yearOf } from '../lib/format';
import { generatePoster } from '../lib/poster';
import type { Album, MediaItem } from '../lib/types';
import { dropKeyedUrls, releaseOriginals } from '../lib/urls';

interface Library {
  ready: boolean;
  albums: Album[];
  refresh: () => Promise<void>;
  update: (id: string, patch: Partial<Album>) => Promise<void>;
  /** Like `update`, but redraws the poster when its ingredients changed. */
  restyle: (id: string, patch: Partial<Pick<Album, 'title' | 'tagline' | 'genre' | 'coverId' | 'posterStyle'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const Ctx = createContext<Library | null>(null);

const newestFirst = (list: Album[]) => [...list].sort((a, b) => b.createdAt - a.createdAt);

// Items rarely change after import, so one in-memory copy per album is enough.
const itemCache = new Map<string, Promise<MediaItem[]>>();
export function loadItems(albumId: string): Promise<MediaItem[]> {
  let p = itemCache.get(albumId);
  if (!p) {
    p = listItems(albumId);
    itemCache.set(albumId, p);
  }
  return p;
}

export function useAlbumItems(albumId: string | undefined): MediaItem[] | undefined {
  const [state, setState] = useState<{ id: string; items: MediaItem[] }>();
  useEffect(() => {
    if (!albumId) return;
    let live = true;
    loadItems(albumId).then((items) => live && setState({ id: albumId, items }));
    return () => {
      live = false;
    };
  }, [albumId]);
  return state && state.id === albumId ? state.items : undefined;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [ready, setReady] = useState(false);
  const latest = useRef(albums);
  latest.current = albums;

  const refresh = useCallback(async () => {
    setAlbums(newestFirst(await listAlbums()));
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => {})
      .then(() => setReady(true));
    sweepOrphans().catch(() => {});
  }, [refresh]);

  const update = useCallback(async (id: string, patch: Partial<Album>) => {
    const current = latest.current.find((a) => a.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    latest.current = latest.current.map((a) => (a.id === id ? next : a));
    setAlbums(latest.current);
    await putAlbum(next);
  }, []);

  const restyle = useCallback<Library['restyle']>(
    async (id, patch) => {
      const current = latest.current.find((a) => a.id === id);
      if (!current) return;
      const next = { ...current, ...patch };
      const redraw = (['title', 'genre', 'coverId', 'posterStyle'] as const).some((k) => next[k] !== current[k]);
      if (!redraw) return update(id, patch);

      const items = await loadItems(id);
      const cover = items.find((i) => i.id === next.coverId) ?? items[0];
      const blob = cover.kind === 'photo' ? ((await getOriginal(cover.id)) ?? cover.thumb) : cover.thumb;
      const poster = await generatePoster({
        cover: blob,
        title: next.title,
        genre: next.genre,
        year: yearOf(next.dateStart),
        count: next.itemCount,
        style: next.posterStyle,
        accent: cover.color,
      });
      await update(id, { ...patch, poster, posterRev: current.posterRev + 1, accent: cover.color });
    },
    [update],
  );

  const remove = useCallback(async (id: string) => {
    const items = await loadItems(id).catch(() => []);
    await deleteAlbum(id);
    itemCache.delete(id);
    releaseOriginals(items.map((i) => i.id));
    dropKeyedUrls(`poster:${id}:`);
    for (const i of items) dropKeyedUrls(`thumb:${i.id}`);
    latest.current = latest.current.filter((a) => a.id !== id);
    setAlbums(latest.current);
  }, []);

  const value = useMemo(() => ({ ready, albums, refresh, update, restyle, remove }), [ready, albums, refresh, update, restyle, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary(): Library {
  const lib = useContext(Ctx);
  if (!lib) throw new Error('useLibrary must be used inside LibraryProvider');
  return lib;
}
