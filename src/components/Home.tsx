import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { plural, runtime, yearOf } from '../lib/format';
import { go, watchPath } from '../lib/router';
import type { Album } from '../lib/types';
import { posterUrl, thumbUrl } from '../lib/urls';
import { useAlbumItems, useLibrary } from '../state/library';
import { Backdrop } from './Backdrop';
import { Icon } from './Icons';
import { usePreview } from './Preview';

const isResumable = (a: Album) => !!a.progress && !a.progress.done && a.progress.index > 0;

export function Meta({ album }: { album: Album }) {
  return (
    <div className="meta">
      <span className="meta-genre">{album.genre}</span>
      <span>{yearOf(album.dateStart)}</span>
      <span>{runtime(album.runtimeSec)}</span>
      <span>{plural(album.itemCount, 'moment')}</span>
      {album.source === 'sample' && <span className="chip">Sample</span>}
    </div>
  );
}

function Hero({ albums }: { albums: Album[] }) {
  const featured = albums.slice(0, 5);
  const [index, setIndex] = useState(0);
  const album = featured[Math.min(index, featured.length - 1)];

  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % featured.length), 21000);
    return () => clearInterval(t);
  }, [featured.length, index]);

  return (
    <section className="hero" style={{ '--accent': album.accent } as React.CSSProperties}>
      <Backdrop key={`art:${album.id}`} ids={album.backdropIds} fallback={posterUrl(album)} />
      <div className="hero-shade" />
      <div className="hero-content" key={album.id}>
        <div className="eyebrow">
          <i /> Now showing
        </div>
        <h1 className={`hero-title t-style-${album.posterStyle}`}>{album.title}</h1>
        <Meta album={album} />
        <p className="hero-tagline">{album.tagline}</p>
        <div className="hero-actions">
          <button className="btn primary" onClick={() => go(watchPath(album.id))}>
            <Icon name="play" /> {isResumable(album) ? 'Resume' : 'Play film'}
          </button>
          <button className="btn glass" onClick={() => go(`/title/${album.id}`)}>
            <Icon name="info" /> Details
          </button>
        </div>
      </div>
      {featured.length > 1 && (
        <div className="hero-dots">
          {featured.map((a, n) => (
            <button key={a.id} className={n === index ? 'on' : ''} onClick={() => setIndex(n)} aria-label={`Feature ${a.title}`} />
          ))}
        </div>
      )}
    </section>
  );
}

function Row({ title, hint, id, children }: { title: string; hint?: string; id?: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  };
  // Re-measure when the row resizes or its contents change.
  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const page = (dir: number) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: 'smooth' });

  return (
    <section className="row" id={id}>
      <header className="row-head">
        <h2>{title}</h2>
        {hint && <span>{hint}</span>}
      </header>
      <div className="row-wrap">
        {edges.left && (
          <button className="row-arrow left" onClick={() => page(-1)} aria-label="Scroll back">
            <Icon name="left" size={26} />
          </button>
        )}
        <div className="row-scroll" ref={scroller} onScroll={measure}>
          {children}
        </div>
        {edges.right && (
          <button className="row-arrow right" onClick={() => page(1)} aria-label="Scroll forward">
            <Icon name="right" size={26} />
          </button>
        )}
      </div>
    </section>
  );
}

export function PosterCard({ album }: { album: Album }) {
  const preview = usePreview();
  return (
    <button
      className="poster-card"
      onClick={() => go(`/title/${album.id}`)}
      onMouseEnter={(e) => preview.show(album, e.currentTarget)}
      onMouseLeave={preview.cancel}
      aria-label={album.title}
    >
      <img src={posterUrl(album)} alt="" loading="lazy" />
    </button>
  );
}

function ContinueCard({ album }: { album: Album }) {
  const items = useAlbumItems(album.id);
  const at = album.progress?.index ?? 0;
  const item = items?.[Math.min(at, (items?.length ?? 1) - 1)];
  const left = Math.max(0, album.runtimeSec * (1 - at / Math.max(1, album.itemCount)));
  return (
    <button className="continue-card" onClick={() => go(watchPath(album.id))} aria-label={`Resume ${album.title}`}>
      <div className="continue-art">
        {item && <img src={thumbUrl(item)} alt="" />}
        <span className="continue-play">
          <Icon name="play" size={26} />
        </span>
        <div className="continue-bar">
          <i style={{ width: `${(at / Math.max(1, album.itemCount - 1)) * 100}%` }} />
        </div>
      </div>
      <div className="continue-info">
        <strong>{album.title}</strong>
        <span>{runtime(left)} left</span>
      </div>
    </button>
  );
}

function NewCard() {
  return (
    <button className="poster-card new-card" onClick={() => go('/new')}>
      <span className="new-plus">
        <Icon name="plus" size={30} />
      </span>
      <strong>New film</strong>
      <span>Turn another album into a premiere</span>
    </button>
  );
}

export function Home({ query }: { query: string }) {
  const { albums } = useLibrary();

  const rows = useMemo(() => {
    const resumable = albums.filter(isResumable).sort((a, b) => b.progress!.updatedAt - a.progress!.updatedAt);
    const list = albums.filter((a) => a.inList);
    const genres = new Map<string, Album[]>();
    for (const a of albums) genres.set(a.genre, [...(genres.get(a.genre) ?? []), a]);
    // With only a handful of films, genre shelves would just repeat the main one.
    const shelves = albums.length >= 4 ? [...genres.entries()].filter(([, l]) => l.length >= 2) : [];
    const throwbacks = albums.length >= 4 ? [...albums].sort((a, b) => a.dateStart - b.dateStart).slice(0, 12) : [];
    return { resumable, list, shelves, throwbacks };
  }, [albums]);

  const q = query.trim().toLowerCase();
  if (q) {
    const hits = albums.filter((a) => `${a.title} ${a.genre} ${yearOf(a.dateStart)} ${a.tagline}`.toLowerCase().includes(q));
    return (
      <main className="results">
        <h2>{hits.length ? `Results for “${query.trim()}”` : `Nothing matches “${query.trim()}”`}</h2>
        <div className="results-grid">
          {hits.map((a) => (
            <PosterCard key={a.id} album={a} />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main>
      <Hero albums={albums} />
      <div className="rows">
        {rows.resumable.length > 0 && (
          <Row title="Pick up where you left off">
            {rows.resumable.map((a) => (
              <ContinueCard key={a.id} album={a} />
            ))}
          </Row>
        )}
        <Row title="Fresh from the darkroom" hint={plural(albums.length, 'film')}>
          {albums.map((a) => (
            <PosterCard key={a.id} album={a} />
          ))}
          <NewCard />
        </Row>
        {rows.list.length > 0 && (
          <Row title="My List" id="my-list">
            {rows.list.map((a) => (
              <PosterCard key={a.id} album={a} />
            ))}
          </Row>
        )}
        {rows.shelves.map(([genre, list]) => (
          <Row key={genre} title={genre}>
            {list.map((a) => (
              <PosterCard key={a.id} album={a} />
            ))}
          </Row>
        ))}
        {rows.throwbacks.length > 0 && (
          <Row title="From the archive" hint="Oldest first">
            {rows.throwbacks.map((a) => (
              <PosterCard key={a.id} album={a} />
            ))}
          </Row>
        )}
      </div>
    </main>
  );
}
