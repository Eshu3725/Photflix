import { useEffect, useState } from 'react';
import { Home } from './components/Home';
import { Logo } from './components/Icons';
import { ImportFlow } from './components/ImportFlow';
import { Player } from './components/Player';
import { PreviewProvider } from './components/Preview';
import { TitleModal } from './components/TitleModal';
import { TopBar } from './components/TopBar';
import { Welcome } from './components/Welcome';
import { go, useRoute } from './lib/router';
import { useLibrary } from './state/library';

export function App() {
  const route = useRoute();
  const { ready, albums } = useLibrary();
  const [query, setQuery] = useState('');

  const target = route.name === 'title' || route.name === 'watch' ? albums.find((a) => a.id === route.id) : undefined;
  const dangling = ready && (route.name === 'title' || route.name === 'watch') && !target;

  // A link to a film that no longer exists goes back to the library.
  useEffect(() => {
    if (dangling) go('/');
  }, [dangling]);

  if (!ready) {
    return (
      <div className="splash">
        <Logo size={34} />
      </div>
    );
  }

  if (route.name === 'watch' && target) {
    return <Player key={`${target.id}:${route.start ?? 'resume'}`} album={target} start={route.start} />;
  }

  return (
    <PreviewProvider>
      <TopBar query={query} onQuery={setQuery} hasLibrary={albums.length > 0} hasList={albums.some((a) => a.inList)} />
      {albums.length ? <Home query={query} /> : <Welcome />}
      {route.name === 'title' && target && <TitleModal key={target.id} album={target} />}
      {route.name === 'new' && <ImportFlow />}
    </PreviewProvider>
  );
}
