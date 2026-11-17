import type { ImportSource } from './types';

// Google Photos via the Photos Picker API. Since 2025 Google no longer lets
// third-party apps read a user's library or album list directly; the Picker
// (a Google-hosted selection screen) is the supported way to receive photos.

const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const API = 'https://photospicker.googleapis.com/v1';
const STORAGE_KEY = 'photflix.googleClientId';

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken: () => void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type?: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

export function getClientId(): string {
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
}

export function saveClientId(id: string) {
  localStorage.setItem(STORAGE_KEY, id.trim());
}

let gis: Promise<void> | undefined;
/** Loads Google Identity Services. Call ahead of the click that requests a token. */
export function loadGis(): Promise<void> {
  gis ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gis = undefined;
      reject(new Error('Could not reach Google sign-in. Check your connection.'));
    };
    document.head.append(s);
  });
  return gis;
}

/** Must be called from a click handler, after `loadGis()` has resolved, or the popup is blocked. */
export function requestToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth = window.google?.accounts.oauth2;
    if (!oauth) return reject(new Error('Google sign-in has not loaded yet. Try again in a moment.'));
    oauth
      .initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) =>
          r.access_token ? resolve(r.access_token) : reject(new Error(r.error_description || r.error || 'Sign-in failed')),
        error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Sign-in was cancelled.' : e.message || 'Sign-in failed')),
      })
      .requestAccessToken();
  });
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Google Photos returned ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface PickerSession {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
}

export const createSession = (token: string) => api<PickerSession>(token, '/sessions', { method: 'POST', body: '{}' });

const seconds = (d: string | undefined, fallback: number) => {
  const n = parseFloat(d ?? '');
  return isFinite(n) && n > 0 ? n : fallback;
};

/** Resolves once the user has finished choosing in the Google picker. */
export async function waitForPick(token: string, session: PickerSession, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + seconds(session.pollingConfig?.timeoutIn, 1800) * 1000;
  let interval = Math.max(2, seconds(session.pollingConfig?.pollInterval, 3));
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const s = await api<PickerSession>(token, `/sessions/${session.id}`);
    if (s.mediaItemsSet) return;
    interval = Math.max(2, seconds(s.pollingConfig?.pollInterval, interval));
  }
  throw new Error('The Google Photos picker timed out. Start again when you are ready.');
}

interface PickedItem {
  id: string;
  createTime?: string;
  type?: 'PHOTO' | 'VIDEO' | string;
  mediaFile: { baseUrl: string; mimeType?: string; filename?: string };
}

export async function listPicked(token: string, sessionId: string): Promise<PickedItem[]> {
  const items: PickedItem[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ sessionId, pageSize: '100' });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await api<{ mediaItems?: PickedItem[]; nextPageToken?: string }>(token, `/mediaItems?${q}`);
    items.push(...(page.mediaItems ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return items;
}

export const endSession = (token: string, sessionId: string) =>
  api<void>(token, `/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});

// The media bytes need the bearer token, and Google's image host may refuse a
// cross-origin browser read. Try directly once; if the browser blocks it, use
// the local proxy (see vite.config.ts) from then on.
let viaProxy = false;

async function download(token: string, url: string): Promise<Blob> {
  const headers = { Authorization: `Bearer ${token}` };
  if (!viaProxy) {
    let res: Response | undefined;
    try {
      res = await fetch(url, { headers });
    } catch {
      viaProxy = true;
    }
    if (res) {
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      return res.blob();
    }
  }
  const res = await fetch(`/api/gphoto?u=${encodeURIComponent(url)}`, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

export function pickedToSources(token: string, items: PickedItem[]): ImportSource[] {
  return items.map((item) => {
    const isVideo = item.type === 'VIDEO' || !!item.mediaFile.mimeType?.startsWith('video/');
    const name = item.mediaFile.filename || `${item.id}.${isVideo ? 'mp4' : 'jpg'}`;
    const takenAt = item.createTime ? Date.parse(item.createTime) : NaN;
    return {
      name,
      takenAt: isNaN(takenAt) ? undefined : takenAt,
      getFile: async () => {
        // "=dv" asks for the video bytes; "=w..-h.." asks for a resized image.
        const blob = await download(token, item.mediaFile.baseUrl + (isVideo ? '=dv' : '=w1920-h1920'));
        const type = isVideo ? item.mediaFile.mimeType || 'video/mp4' : blob.type || 'image/jpeg';
        return new File([blob], name, { type });
      },
    };
  });
}
