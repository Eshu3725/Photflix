import { useMemo, useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'title'; id: string }
  | { name: 'watch'; id: string; start?: number }
  | { name: 'new' };

function parse(hash: string): Route {
  const [path, query] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'title' && parts[1]) return { name: 'title', id: parts[1] };
  if (parts[0] === 'watch' && parts[1]) {
    const s = new URLSearchParams(query ?? '').get('s');
    return { name: 'watch', id: parts[1], start: s === null ? undefined : Number(s) };
  }
  if (parts[0] === 'new') return { name: 'new' };
  return { name: 'home' };
}

// Remember where the viewer was browsing so leaving the player returns there.
let lastBrowse = '#/';
window.addEventListener('hashchange', (e) => {
  const old = new URL(e.oldURL).hash;
  if (!old.startsWith('#/watch') && !old.startsWith('#/new')) lastBrowse = old || '#/';
});

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parse(hash), [hash]);
}

export function go(path: string) {
  window.location.hash = path;
}

export const watchPath = (id: string, start?: number) => `/watch/${id}${start === undefined ? '' : `?s=${start}`}`;

export function exitWatch() {
  window.location.hash = lastBrowse;
}
