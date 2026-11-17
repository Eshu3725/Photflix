import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { plural, runtime, yearOf } from '../lib/format';
import { sample } from '../lib/importer';
import { go, watchPath } from '../lib/router';
import type { Album } from '../lib/types';
import { thumbUrl } from '../lib/urls';
import { useAlbumItems, useLibrary } from '../state/library';
import { Icon } from './Icons';

interface Target {
  album: Album;
  rect: DOMRect;
}
interface PreviewApi {
  show: (album: Album, el: HTMLElement) => void;
  /** Cancels a preview that has not opened yet. */
  cancel: () => void;
  hide: () => void;
}

const Ctx = createContext<PreviewApi>({ show: () => {}, cancel: () => {}, hide: () => {} });
export const usePreview = () => useContext(Ctx);

const WIDTH = 340;

function Card({ target, onClose }: { target: Target; onClose: () => void }) {
  const { albums, update } = useLibrary();
  // Read the live album so the list button reflects changes immediately.
  const album = albums.find((a) => a.id === target.album.id) ?? target.album;
  const items = useAlbumItems(album.id);
  const frames = useMemo(() => sample(items ?? [], 8), [items]);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (frames.length < 2) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1700);
    return () => clearInterval(t);
  }, [frames.length]);

  const { rect } = target;
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 12);
  const top = Math.max(76, rect.top + rect.height / 2 - 170);
  const resume = album.progress && !album.progress.done && album.progress.index > 0;

  return (
    <div className="preview" style={{ left, top, width: WIDTH, '--accent': album.accent } as React.CSSProperties} onMouseLeave={onClose}>
      <button className="preview-stage" onClick={() => go(watchPath(album.id))} aria-label={`Play ${album.title}`}>
        {frames.map((item, n) => (
          <img key={item.id} className={n === frame ? 'on' : ''} src={thumbUrl(item)} alt="" />
        ))}
        <span className={`preview-title t-style-${album.posterStyle}`}>{album.title}</span>
        <span className="preview-dots">
          {frames.map((f, n) => (
            <i key={f.id} className={n === frame ? 'on' : ''} />
          ))}
        </span>
      </button>
      <div className="preview-body">
        <div className="preview-actions">
          <button className="round primary" onClick={() => go(watchPath(album.id))} title={resume ? 'Resume' : 'Play'}>
            <Icon name="play" />
          </button>
          <button
            className={`round${album.inList ? ' active' : ''}`}
            onClick={() => update(album.id, { inList: !album.inList })}
            title={album.inList ? 'Remove from My List' : 'Add to My List'}
          >
            <Icon name={album.inList ? 'check' : 'plus'} />
          </button>
          <span className="spacer" />
          <button className="round" onClick={() => go(`/title/${album.id}`)} title="Details">
            <Icon name="down" />
          </button>
        </div>
        <div className="meta">
          <span className="meta-genre">{album.genre}</span>
          <span>{yearOf(album.dateStart)}</span>
          <span>{runtime(album.runtimeSec)}</span>
          <span>{plural(album.itemCount, 'moment')}</span>
        </div>
        <p className="preview-tagline">{album.tagline}</p>
      </div>
    </div>
  );
}

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const timer = useRef<number>(undefined);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setTarget(null);
  }, []);

  const show = useCallback((album: Album, el: HTMLElement) => {
    clearTimeout(timer.current);
    // A short dwell so sweeping the pointer across a row does not open every card.
    timer.current = window.setTimeout(() => setTarget({ album, rect: el.getBoundingClientRect() }), 480);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', hide, true);
    window.addEventListener('hashchange', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('hashchange', hide);
    };
  }, [hide]);

  const cancel = useCallback(() => clearTimeout(timer.current), []);
  const api = useMemo(() => ({ show, cancel, hide }), [show, cancel, hide]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {target && createPortal(<Card key={target.album.id} target={target} onClose={hide} />, document.body)}
    </Ctx.Provider>
  );
}
