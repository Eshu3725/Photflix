import { useEffect, useState } from 'react';
import { useOriginal } from '../lib/urls';

function Slide({ id, active }: { id: string; active: boolean }) {
  const url = useOriginal(id);
  const [loaded, setLoaded] = useState(false);
  return <img className={`backdrop-slide${active && loaded ? ' on' : ''}`} src={url} onLoad={() => setLoaded(true)} alt="" />;
}

/** Slow cross-fading, drifting artwork made from an album's best wide photos. */
export function Backdrop({ ids, fallback, interval = 7000 }: { ids: string[]; fallback: string; interval?: number }) {
  const [index, setIndex] = useState(0);
  const key = ids.join();
  useEffect(() => {
    setIndex(0);
    if (ids.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % ids.length), interval);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, interval]);

  return (
    <div className="backdrop">
      <img className="backdrop-fallback" src={fallback} alt="" />
      {ids.map((id, n) => (
        <Slide key={id} id={id} active={n === index} />
      ))}
    </div>
  );
}
