import type { ReactNode } from 'react';

const solid = { fill: 'currentColor', stroke: 'none' } as const;

const PATHS = {
  play: <path d="M8 5.2v13.6a.6.6 0 0 0 .92.5l10.6-6.8a.6.6 0 0 0 0-1L8.92 4.7A.6.6 0 0 0 8 5.2z" {...solid} />,
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1" {...solid} />
      <rect x="13.5" y="5" width="4" height="14" rx="1" {...solid} />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  prev: (
    <>
      <path d="M18.5 6v12l-9-6z" {...solid} />
      <rect x="5.5" y="6" width="2.4" height="12" rx="1" {...solid} />
    </>
  ),
  next: (
    <>
      <path d="M5.5 6v12l9-6z" {...solid} />
      <rect x="16.1" y="6" width="2.4" height="12" rx="1" {...solid} />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" {...solid} />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" {...solid} />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  edit: <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 7.5l3 3" />,
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5" />,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  images: (
    <>
      <rect x="3.5" y="6.5" width="14" height="12" rx="2" />
      <path d="M7 3.5h11.5a2 2 0 0 1 2 2V15M3.5 15.5l4-4 4 4 2.5-2.5 3.5 3.5" />
    </>
  ),
  cloud: <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18.5z" />,
  sparkle: <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" {...solid} />,
  music: (
    <>
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </>
  ),
  replay: <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4v4h4" />,
  frame: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M4 15l4.5-4.5 4 4 2.5-2.5 5 5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      <svg width={size * 1.1} height={size * 1.1} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--amber)" />
        <path d="M12.5 9.5v13l11-6.5z" fill="var(--amber-ink)" />
        <circle cx="6.5" cy="9" r="1.4" fill="var(--amber-ink)" opacity=".55" />
        <circle cx="6.5" cy="16" r="1.4" fill="var(--amber-ink)" opacity=".55" />
        <circle cx="6.5" cy="23" r="1.4" fill="var(--amber-ink)" opacity=".55" />
      </svg>
      <span className="logo-word">
        phot<em>flix</em>
      </span>
    </span>
  );
}
