import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clock, plural, runtime, yearOf } from '../lib/format';
import { exitWatch, go, watchPath } from '../lib/router';
import { chaptersOf, sceneSeconds, type Chapter } from '../lib/scenes';
import type { Album, MediaItem } from '../lib/types';
import { keyedUrl, originalUrl, posterUrl, releaseOriginals, thumbUrl, useOriginal } from '../lib/urls';
import { useAlbumItems, useLibrary } from '../state/library';
import { Icon, Logo } from './Icons';

/** Cross-dissolve between scenes, seconds. */
const XFADE = 1.2;
const TITLE_SEC = 6.5;
const SPEEDS = [0.5, 1, 1.5, 2];

type Scene =
  | { kind: 'title'; dur: number }
  | { kind: 'media'; dur: number; item: MediaItem; index: number; chapter: Chapter; opens: boolean }
  | { kind: 'credits'; dur: number };

// ---------- Scenes ----------

function PhotoScene({ item, dur, speed, playing }: { item: MediaItem; dur: number; speed: number; playing: boolean }) {
  const full = useOriginal(item.id);
  const thumb = thumbUrl(item);
  // Wide shots fill the frame; portraits float over a blurred copy of themselves.
  const fill = item.width / item.height >= 1.2;
  const move = fill ? `kb-${item.order % 6}` : `kbc-${item.order % 2}`;
  return (
    <div className="scene">
      <img className="scene-blur" src={thumb} alt="" />
      <div className={`scene-move ${move}`} style={{ animationDuration: `${(dur + XFADE) / speed}s`, animationPlayState: playing ? 'running' : 'paused' }}>
        <img className={fill ? 'fill' : 'fit'} src={full ?? thumb} alt="" />
      </div>
    </div>
  );
}

function VideoScene({ item, speed, playing, muted, onTime, onEnded }: { item: MediaItem; speed: number; playing: boolean; muted: boolean; onTime?: (t: number) => void; onEnded?: () => void }) {
  const url = useOriginal(item.id);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !url) return;
    v.playbackRate = speed;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, speed, url]);
  return (
    <div className="scene">
      <img className="scene-blur" src={thumbUrl(item)} alt="" />
      <video
        ref={ref}
        className="fit"
        src={url}
        muted={muted}
        playsInline
        poster={thumbUrl(item)}
        onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime)}
        onEnded={onEnded}
        onError={onEnded}
      />
    </div>
  );
}

function TitleScene({ album, playing }: { album: Album; playing: boolean }) {
  return (
    <div className={`scene title-scene${playing ? '' : ' paused'}`} style={{ '--accent': album.accent } as React.CSSProperties}>
      <img className="scene-blur strong" src={posterUrl(album)} alt="" />
      <div className="ident">
        <Logo size={44} />
        <span className="ident-beam" />
      </div>
      <div className="title-card">
        <span className="title-presents">A Photflix premiere</span>
        <h1 className={`t-style-${album.posterStyle}`}>{album.title}</h1>
        <p>{album.tagline}</p>
      </div>
    </div>
  );
}

function CreditsScene({ album, chapters, next, playing, onReplay, onNext }: { album: Album; chapters: Chapter[]; next?: Album; playing: boolean; onReplay: () => void; onNext: () => void }) {
  const [count, setCount] = useState(12);
  useEffect(() => {
    if (!next || !playing) return;
    const t = setInterval(() => setCount((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [next, playing]);
  useEffect(() => {
    if (next && count <= 0) onNext();
  }, [count, next, onNext]);

  return (
    <div className="scene credits" style={{ '--accent': album.accent } as React.CSSProperties}>
      <img className="scene-blur strong" src={posterUrl(album)} alt="" />
      <div className="credits-main">
        <span className="title-presents">The end</span>
        <h1 className={`t-style-${album.posterStyle}`}>{album.title}</h1>
        <dl>
          <dt>Directed by</dt>
          <dd>You</dd>
          <dt>Filmed on location</dt>
          <dd>
            {yearOf(album.dateStart)} · {plural(chapters.length, 'chapter')}
          </dd>
          <dt>Featuring</dt>
          <dd>{plural(album.itemCount, 'moment')} worth keeping</dd>
        </dl>
        <div className="hero-actions">
          <button className="btn glass" onClick={onReplay}>
            <Icon name="replay" /> Watch again
          </button>
          <button className="btn glass" onClick={exitWatch}>
            Back to library
          </button>
        </div>
      </div>
      {next && (
        <button className="up-next" onClick={onNext}>
          <img src={posterUrl(next)} alt="" />
          <span>
            <small>Up next in {Math.max(0, count)}</small>
            <strong>{next.title}</strong>
            <em>
              <Icon name="play" size={16} /> Play now
            </em>
          </span>
        </button>
      )}
    </div>
  );
}

// ---------- Player ----------

function PlayerInner({ album, items, start }: { album: Album; items: MediaItem[]; start?: number }) {
  const { albums, update } = useLibrary();
  const chapters = useMemo(() => chaptersOf(items), [items]);

  const scenes = useMemo<Scene[]>(() => {
    const media = items.map<Scene>((item, index) => {
      const chapter = chapters.findLast((c) => c.start <= index)!;
      return { kind: 'media', dur: sceneSeconds(item), item, index, chapter, opens: chapter.start === index };
    });
    return [{ kind: 'title', dur: TITLE_SEC }, ...media, { kind: 'credits', dur: 0 }];
  }, [items, chapters]);

  // Film-time at which each scene begins; the last entry is the total running time.
  const starts = useMemo(() => {
    const out = [0];
    for (const s of scenes) out.push(out[out.length - 1] + s.dur);
    return out;
  }, [scenes]);
  const total = starts[scenes.length - 1];
  const creditsAt = scenes.length - 1;

  const [idx, setIdx] = useState(() => {
    if (start !== undefined && start >= 0 && start < items.length) return start + 1;
    const p = album.progress;
    return p && !p.done && p.index > 0 && p.index < items.length ? p.index + 1 : 0;
  });
  const [leaving, setLeaving] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [full, setFull] = useState(false);
  const [hover, setHover] = useState<{ x: number; scene: number } | null>(null);

  const idxRef = useRef(idx);
  const elapsed = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const fillEl = useRef<HTMLElement>(null);
  const timeEl = useRef<HTMLSpanElement>(null);
  const music = useRef<HTMLAudioElement>(null);
  const scene = scenes[idx];

  const goTo = useCallback(
    (target: number) => {
      const n = Math.min(Math.max(target, 0), scenes.length - 1);
      if (n === idxRef.current) return;
      setLeaving(idxRef.current);
      idxRef.current = n;
      elapsed.current = 0;
      setIdx(n);
    },
    [scenes.length],
  );

  const paint = useCallback(() => {
    const i = idxRef.current;
    const t = Math.min(total, starts[i] + Math.min(elapsed.current, scenes[i].dur));
    if (fillEl.current) fillEl.current.style.width = `${(t / total) * 100}%`;
    if (timeEl.current) timeEl.current.textContent = `${clock(t)} / ${clock(total)}`;
  }, [scenes, starts, total]);

  // The clock. Stills advance on a timer; videos report their own position.
  useEffect(() => {
    const current = scenes[idx];
    const timed = current.kind !== 'credits' && !(current.kind === 'media' && current.item.kind === 'video');
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playing && timed) {
        elapsed.current += dt * speed;
        if (elapsed.current >= current.dur) return goTo(idx + 1);
      }
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idx, playing, speed, scenes, goTo, paint]);

  // Keep the outgoing scene underneath just long enough for the dissolve.
  useEffect(() => {
    if (leaving === null) return;
    const t = setTimeout(() => setLeaving(null), XFADE * 1000 + 80);
    return () => clearTimeout(t);
  }, [leaving, idx]);

  // Warm up the next couple of photos, and free everything on the way out.
  const touched = useRef(new Set<string>());
  useEffect(() => {
    for (let i = idx; i <= idx + 2 && i < scenes.length; i++) {
      const s = scenes[i];
      if (s.kind === 'media') {
        // Backdrop photos stay cached: the library screen shows them the moment the player closes.
        if (!album.backdropIds.includes(s.item.id)) touched.current.add(s.item.id);
        if (s.item.kind === 'photo') originalUrl(s.item.id).then((u) => void (new Image().src = u), () => {});
      }
    }
  }, [idx, scenes, album.backdropIds]);
  useEffect(() => {
    const ids = touched.current;
    return () => releaseOriginals(ids);
  }, []);

  // Remember the viewer's place.
  useEffect(() => {
    if (scene.kind === 'media') update(album.id, { progress: { index: scene.index, updatedAt: Date.now(), done: false } });
    else if (scene.kind === 'credits') update(album.id, { progress: { index: 0, updatedAt: Date.now(), done: true } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Soundtrack follows the film: pauses with it, ducks under video sound.
  const onVideo = scene.kind === 'media' && scene.item.kind === 'video';
  useEffect(() => {
    const a = music.current;
    if (!a) return;
    a.volume = onVideo ? 0.12 : 0.75;
    a.muted = muted;
    if (playing) a.play().catch(() => {});
    else a.pause();
  }, [playing, muted, onVideo, album.soundtrack]);

  // Controls fade out while the film plays untouched.
  const idle = useRef<number>(undefined);
  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setChrome(false), 2800);
  }, []);
  useEffect(() => {
    wake();
    return () => clearTimeout(idle.current);
  }, [wake]);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const leave = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    exitWatch();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const i = idxRef.current;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case 'ArrowRight':
          goTo(i + 1);
          break;
        case 'ArrowLeft':
          goTo(i - 1);
          break;
        case 'f':
          toggleFull();
          break;
        case 'm':
          setMuted((m) => !m);
          break;
        case 'Escape':
          // In fullscreen the browser uses Escape to leave fullscreen first.
          if (!document.fullscreenElement) leave();
          break;
        default:
          return;
      }
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, toggleFull, leave, wake]);

  const next = useMemo(() => {
    if (albums.length < 2) return undefined;
    const at = albums.findIndex((a) => a.id === album.id);
    return albums[(at + 1) % albums.length];
  }, [albums, album.id]);
  const playNext = useCallback(() => next && go(watchPath(next.id, 0)), [next]);

  const sceneAt = (clientX: number, bar: HTMLElement) => {
    const r = bar.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * total;
    const i = starts.findLastIndex((s) => s <= t);
    return { x: clientX - r.left, scene: Math.min(Math.max(i, 0), creditsAt - 1) };
  };

  const render = (i: number, live: boolean) => {
    const s = scenes[i];
    if (s.kind === 'title') return <TitleScene key={i} album={album} playing={playing} />;
    if (s.kind === 'credits')
      return <CreditsScene key={i} album={album} chapters={chapters} next={next} playing={playing && live} onReplay={() => goTo(0)} onNext={playNext} />;
    if (s.item.kind === 'video')
      return (
        <VideoScene
          key={i}
          item={s.item}
          speed={speed}
          playing={playing && live}
          muted={muted || !live}
          onTime={live ? (t) => (elapsed.current = t) : undefined}
          onEnded={live ? () => goTo(i + 1) : undefined}
        />
      );
    return <PhotoScene key={i} item={s.item} dur={s.dur} speed={speed} playing={playing} />;
  };

  const onCredits = scene.kind === 'credits';
  const hovered = hover && scenes[hover.scene];

  return (
    <div
      ref={root}
      className={`player${chrome || !playing || onCredits ? ' chrome' : ''}`}
      onMouseMove={wake}
      onClick={(e) => {
        // A click on the picture itself toggles playback.
        if (e.target instanceof Element && !e.target.closest('button, a, .player-bar')) setPlaying((p) => !p);
        wake();
      }}
    >
      <div className="stage">
        {leaving !== null && leaving !== idx && render(leaving, false)}
        {render(idx, true)}
      </div>

      {scene.kind === 'media' && scene.opens && chapters.length > 1 && (
        <div className="lower-third" key={idx}>
          <span>Chapter {scene.chapter.n}</span>
          <strong>{scene.chapter.label}</strong>
        </div>
      )}

      {!playing && !onCredits && (
        <div className="paused-badge">
          <Icon name="pause" size={34} />
        </div>
      )}

      {album.soundtrack && <audio ref={music} src={keyedUrl(`sound:${album.id}`, album.soundtrack.blob)} loop />}

      <header className="player-top">
        <button className="round ghost" onClick={leave} aria-label="Back to library">
          <Icon name="back" size={24} />
        </button>
        <div className="player-heading">
          <strong>{album.title}</strong>
          {scene.kind === 'media' && (
            <span>
              {chapters.length > 1 && `Chapter ${scene.chapter.n} · `}
              {scene.chapter.label}
            </span>
          )}
        </div>
      </header>

      {!onCredits && (
        <footer className="player-bottom">
          <div
            className="player-bar"
            onMouseMove={(e) => setHover(sceneAt(e.clientX, e.currentTarget))}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => goTo(sceneAt(e.clientX, e.currentTarget).scene)}
          >
            <div className="player-track">
              <i ref={fillEl} />
              {chapters.slice(1).map((c) => (
                <b key={c.n} style={{ left: `${(starts[c.start + 1] / total) * 100}%` }} />
              ))}
            </div>
            {hover && hovered && (
              <div className="bar-tip" style={{ left: hover.x }}>
                {hovered.kind === 'media' && <img src={thumbUrl(hovered.item)} alt="" />}
                <span>{hovered.kind === 'media' ? `Scene ${hovered.index + 1} · ${clock(starts[hover.scene])}` : 'Opening titles'}</span>
              </div>
            )}
          </div>
          <div className="player-controls">
            <button className="round ghost" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
              <Icon name={playing ? 'pause' : 'play'} size={28} />
            </button>
            <button className="round ghost" onClick={() => goTo(idx - 1)} aria-label="Previous scene" disabled={idx === 0}>
              <Icon name="prev" size={24} />
            </button>
            <button className="round ghost" onClick={() => goTo(idx + 1)} aria-label="Next scene">
              <Icon name="next" size={24} />
            </button>
            <button className="round ghost" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
              <Icon name={muted ? 'mute' : 'volume'} size={24} />
            </button>
            <span className="player-time" ref={timeEl} />
            <span className="spacer" />
            <span className="player-count">
              {scene.kind === 'media' ? `${scene.index + 1} / ${items.length}` : runtime(total)}
            </span>
            <button className="pill" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} title="Playback speed">
              {speed}×
            </button>
            <button className="round ghost" onClick={toggleFull} aria-label="Fullscreen">
              <Icon name={full ? 'shrink' : 'expand'} size={24} />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

export function Player({ album, start }: { album: Album; start?: number }) {
  const items = useAlbumItems(album.id);
  if (!items) return <div className="player" />;
  if (!items.length) {
    return (
      <div className="player chrome empty">
        <p>This film has no scenes.</p>
        <button className="btn glass" onClick={exitWatch}>
          Back to library
        </button>
      </div>
    );
  }
  return <PlayerInner album={album} items={items} start={start} />;
}
