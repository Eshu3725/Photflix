import { useEffect, useMemo, useRef, useState } from 'react';
import { dateRange, plural, runtime } from '../lib/format';
import { POSTER_STYLES } from '../lib/poster';
import { go, watchPath } from '../lib/router';
import { chaptersOf } from '../lib/scenes';
import { GENRES, type Album, type Genre } from '../lib/types';
import { dropKeyedUrls, posterUrl, thumbUrl } from '../lib/urls';
import { useAlbumItems, useLibrary } from '../state/library';
import { Backdrop } from './Backdrop';
import { Meta, PosterCard } from './Home';
import { Icon } from './Icons';

const SOURCE_LABEL = { device: 'This device', google: 'Google Photos', sample: 'Sample library' } as const;

function Editor({ album, picking, onPick, onDone }: { album: Album; picking: boolean; onPick: (on: boolean) => void; onDone: () => void }) {
  const { restyle, update, remove } = useLibrary();
  const [title, setTitle] = useState(album.title);
  const [tagline, setTagline] = useState(album.tagline);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const audio = useRef<HTMLInputElement>(null);

  const apply = async (patch: Parameters<typeof restyle>[1]) => {
    setBusy(true);
    try {
      await restyle(album.id, patch);
    } finally {
      setBusy(false);
    }
  };
  const commitText = () => {
    const t = title.trim() || album.title;
    setTitle(t);
    if (t !== album.title || tagline.trim() !== album.tagline) apply({ title: t, tagline: tagline.trim() });
  };

  return (
    <section className="editor">
      <div className="editor-poster">
        <img src={posterUrl(album)} alt="" className={busy ? 'busy' : ''} />
      </div>
      <div className="editor-fields">
        <label>
          <span>Title</span>
          <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} onBlur={commitText} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </label>
        <label>
          <span>Tagline</span>
          <input value={tagline} maxLength={120} onChange={(e) => setTagline(e.target.value)} onBlur={commitText} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </label>
        <div className="editor-row">
          <label>
            <span>Genre</span>
            <select value={album.genre} onChange={(e) => apply({ genre: e.target.value as Genre })}>
              {GENRES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Poster style</span>
            <div className="segmented">
              {POSTER_STYLES.map((name, n) => (
                <button key={name} className={album.posterStyle === n ? 'on' : ''} onClick={() => apply({ posterStyle: n })} disabled={busy}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="editor-row wrap">
          <button className={`btn small ${picking ? 'primary' : 'glass'}`} onClick={() => onPick(!picking)}>
            <Icon name="frame" size={18} /> {picking ? 'Click a scene below…' : 'Change cover photo'}
          </button>
          <input
            ref={audio}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                dropKeyedUrls(`sound:${album.id}`);
                update(album.id, { soundtrack: { name: file.name, blob: file.slice(0, file.size, file.type) } });
              }
              e.target.value = '';
            }}
          />
          {album.soundtrack ? (
            <button
              className="btn small glass"
              title="Remove soundtrack"
              onClick={() => {
                dropKeyedUrls(`sound:${album.id}`);
                update(album.id, { soundtrack: undefined });
              }}
            >
              <Icon name="music" size={18} /> <span className="clip">{album.soundtrack.name}</span> <Icon name="close" size={16} />
            </button>
          ) : (
            <button className="btn small glass" onClick={() => audio.current?.click()}>
              <Icon name="music" size={18} /> Add a soundtrack
            </button>
          )}
        </div>
        <div className="editor-row wrap end">
          {confirming ? (
            <>
              <span className="muted">Delete this film and its stored photos?</span>
              <button className="btn small glass" onClick={() => setConfirming(false)}>
                Keep
              </button>
              <button
                className="btn small danger"
                onClick={async () => {
                  await remove(album.id);
                  go('/');
                }}
              >
                Delete film
              </button>
            </>
          ) : (
            <>
              <button className="btn small ghost danger-text" onClick={() => setConfirming(true)}>
                <Icon name="trash" size={18} /> Delete film
              </button>
              <button className="btn small primary" onClick={onDone}>
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function TitleModal({ album }: { album: Album }) {
  const { albums, update, restyle } = useLibrary();
  const items = useAlbumItems(album.id);
  const chapters = useMemo(() => (items ? chaptersOf(items) : []), [items]);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const close = () => go('/');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && go('/');
    window.addEventListener('keydown', onKey);
    document.body.classList.add('locked');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('locked');
    };
  }, []);

  const resume = album.progress && !album.progress.done && album.progress.index > 0;
  const others = albums.filter((a) => a.id !== album.id);
  const related = [...others.filter((a) => a.genre === album.genre), ...others.filter((a) => a.genre !== album.genre)].slice(0, 6);

  const onScene = async (index: number) => {
    if (!picking || !items) return go(watchPath(album.id, index));
    setPicking(false);
    sheet.current?.parentElement?.scrollTo({ top: 0, behavior: 'smooth' });
    await restyle(album.id, { coverId: items[index].id });
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" ref={sheet} role="dialog" aria-modal="true" aria-label={album.title} style={{ '--accent': album.accent } as React.CSSProperties}>
        <button className="round sheet-close" onClick={close} aria-label="Close">
          <Icon name="close" />
        </button>
        <header className="sheet-hero">
          <Backdrop ids={album.backdropIds} fallback={posterUrl(album)} interval={5500} />
          <div className="sheet-hero-shade" />
          <div className="sheet-hero-content">
            <h1 className={`hero-title t-style-${album.posterStyle}`}>{album.title}</h1>
            <div className="hero-actions">
              <button className="btn primary" onClick={() => go(watchPath(album.id))}>
                <Icon name="play" /> {resume ? 'Resume' : 'Play film'}
              </button>
              {resume && (
                <button className="btn glass" onClick={() => go(watchPath(album.id, 0))}>
                  <Icon name="replay" /> From the start
                </button>
              )}
              <button className={`round${album.inList ? ' active' : ''}`} onClick={() => update(album.id, { inList: !album.inList })} title={album.inList ? 'Remove from My List' : 'Add to My List'}>
                <Icon name={album.inList ? 'check' : 'plus'} />
              </button>
              <button className={`round${editing ? ' active' : ''}`} onClick={() => (setEditing(!editing), setPicking(false))} title="Edit film">
                <Icon name="edit" />
              </button>
            </div>
          </div>
        </header>

        <div className="sheet-body">
          {editing ? (
            <Editor key={album.id} album={album} picking={picking} onPick={setPicking} onDone={() => (setEditing(false), setPicking(false))} />
          ) : (
            <section className="about">
              <div>
                <Meta album={album} />
                <p className="about-tagline">{album.tagline}</p>
              </div>
              <dl>
                <dt>Filmed</dt>
                <dd>{dateRange(album.dateStart, album.dateEnd)}</dd>
                <dt>Running time</dt>
                <dd>
                  {runtime(album.runtimeSec)} · {plural(chapters.length || 1, 'chapter')}
                </dd>
                <dt>Source</dt>
                <dd>{SOURCE_LABEL[album.source]}</dd>
                {album.soundtrack && (
                  <>
                    <dt>Soundtrack</dt>
                    <dd className="clip">{album.soundtrack.name}</dd>
                  </>
                )}
              </dl>
            </section>
          )}

          <section className={`scenes${picking ? ' picking' : ''}`}>
            <h2>{picking ? 'Choose a cover photo' : 'Scenes'}</h2>
            {chapters.map((c) => (
              <div className="chapter" key={c.n}>
                <header>
                  <span className="chapter-n">Chapter {c.n}</span>
                  <strong>{c.label}</strong>
                  <span className="muted">{plural(c.count, 'moment')}</span>
                </header>
                <div className="scene-grid">
                  {items!.slice(c.start, c.start + c.count).map((item, k) => (
                    <button key={item.id} className={`scene-thumb${item.id === album.coverId ? ' cover' : ''}`} onClick={() => onScene(c.start + k)}>
                      <img src={thumbUrl(item)} alt="" loading="lazy" />
                      <span className="scene-thumb-icon">
                        <Icon name={picking ? 'frame' : 'play'} size={22} />
                      </span>
                      {item.kind === 'video' && <span className="chip corner">Video</span>}
                      {album.progress && !album.progress.done && album.progress.index === c.start + k && album.progress.index > 0 && <i className="scene-here" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {related.length > 0 && (
            <section className="related">
              <h2>More from your library</h2>
              <div className="related-grid">
                {related.map((a) => (
                  <PosterCard key={a.id} album={a} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
