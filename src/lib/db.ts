import { openDB, type DBSchema } from 'idb';
import type { Album, MediaItem } from './types';

interface Schema extends DBSchema {
  albums: { key: string; value: Album };
  items: { key: string; value: MediaItem; indexes: { albumId: string } };
  originals: { key: string; value: Blob };
}

const dbp = openDB<Schema>('photflix', 1, {
  upgrade(db) {
    db.createObjectStore('albums', { keyPath: 'id' });
    const items = db.createObjectStore('items', { keyPath: 'id' });
    items.createIndex('albumId', 'albumId');
    db.createObjectStore('originals');
  },
});

export async function listAlbums(): Promise<Album[]> {
  return (await dbp).getAll('albums');
}

export async function putAlbum(album: Album): Promise<void> {
  await (await dbp).put('albums', album);
}

export async function deleteAlbum(id: string): Promise<void> {
  const db = await dbp;
  const tx = db.transaction(['albums', 'items', 'originals'], 'readwrite');
  const keys = await tx.objectStore('items').index('albumId').getAllKeys(id);
  for (const key of keys) {
    tx.objectStore('items').delete(key);
    tx.objectStore('originals').delete(key);
  }
  tx.objectStore('albums').delete(id);
  await tx.done;
}

export async function listItems(albumId: string): Promise<MediaItem[]> {
  const items = await (await dbp).getAllFromIndex('items', 'albumId', albumId);
  return items.sort((a, b) => a.order - b.order);
}

export async function putItems(items: MediaItem[]): Promise<void> {
  const tx = (await dbp).transaction('items', 'readwrite');
  for (const item of items) tx.store.put(item);
  await tx.done;
}

export async function putOriginal(id: string, blob: Blob): Promise<void> {
  await (await dbp).put('originals', blob, id);
}

export async function getOriginal(id: string): Promise<Blob | undefined> {
  return (await dbp).get('originals', id);
}

export async function deleteOriginals(ids: string[]): Promise<void> {
  const tx = (await dbp).transaction('originals', 'readwrite');
  for (const id of ids) tx.store.delete(id);
  await tx.done;
}

/** Removes media left behind by an import that was interrupted. */
export async function sweepOrphans(): Promise<void> {
  const db = await dbp;
  const [originals, items] = await Promise.all([db.getAllKeys('originals'), db.getAllKeys('items')]);
  const known = new Set(items);
  const orphans = originals.filter((k) => !known.has(k));
  if (orphans.length) await deleteOriginals(orphans);
}
