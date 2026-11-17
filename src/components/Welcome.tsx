import { go } from '../lib/router';
import { Icon } from './Icons';

/** First-run screen, shown while the library is empty. */
export function Welcome() {
  return (
    <main className="welcome">
      <div className="welcome-glow" />
      <div className="welcome-inner">
        <div className="eyebrow">
          <i /> Private screening room
        </div>
        <h1>
          Your camera roll
          <br />
          deserves a <em>premiere.</em>
        </h1>
        <p>
          Point Photflix at an album and it cuts a film from it: a poster, chapters, slow cinematic motion, and a seat in
          your own streaming library. Everything stays on this device.
        </p>
        <div className="hero-actions">
          <button className="btn primary large" onClick={() => go('/new')}>
            <Icon name="plus" /> Make your first film
          </button>
        </div>
        <ul className="welcome-points">
          <li>
            <Icon name="folder" /> <span>Folders on this device</span>
          </li>
          <li>
            <Icon name="cloud" /> <span>Google Photos</span>
          </li>
          <li>
            <Icon name="sparkle" /> <span>Or try the sample library</span>
          </li>
        </ul>
      </div>
    </main>
  );
}
