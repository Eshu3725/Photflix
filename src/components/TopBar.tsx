import { useEffect, useRef, useState } from 'react';
import { go } from '../lib/router';
import { Icon, Logo } from './Icons';

export function TopBar({ query, onQuery, hasLibrary, hasList }: { query: string; onQuery: (q: string) => void; hasLibrary: boolean; hasList: boolean }) {
  const [solid, setSolid] = useState(false);
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const home = () => {
    onQuery('');
    go('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const toList = () => {
    onQuery('');
    go('/');
    requestAnimationFrame(() => document.getElementById('my-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  return (
    <header className={`topbar${solid || query ? ' solid' : ''}`}>
      <button className="topbar-logo" onClick={home} aria-label="Photflix home">
        <Logo />
      </button>
      {hasLibrary && (
        <nav className="topbar-nav">
          <button onClick={home}>Home</button>
          {hasList && <button onClick={toList}>My List</button>}
        </nav>
      )}
      <span className="spacer" />
      {hasLibrary && (
        <>
          <label className={`search${searching || query ? ' open' : ''}`}>
            <button
              type="button"
              onClick={() => {
                setSearching(true);
                input.current?.focus();
              }}
              aria-label="Search films"
            >
              <Icon name="search" />
            </button>
            <input
              ref={input}
              value={query}
              placeholder="Titles, genres, years"
              onChange={(e) => onQuery(e.target.value)}
              onFocus={() => setSearching(true)}
              onBlur={() => setSearching(false)}
              onKeyDown={(e) => e.key === 'Escape' && (onQuery(''), e.currentTarget.blur())}
            />
          </label>
          <button className="btn outline small" onClick={() => go('/new')}>
            <Icon name="plus" size={18} /> New film
          </button>
        </>
      )}
    </header>
  );
}
