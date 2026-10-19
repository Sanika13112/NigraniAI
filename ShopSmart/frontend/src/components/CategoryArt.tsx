import type { CSSProperties, ReactNode } from 'react';

/**
 * Original line illustrations for each category. They're bundled with the app, so the category
 * tiles always look complete, even before a category has any products or photos.
 */
const ART: Record<string, { hue: number; draw: ReactNode }> = {
  Electronics: {
    hue: 258,
    draw: (
      <>
        <path className="fill" d="M22 66h16v28H28a6 6 0 0 1-6-6zM82 66h16v22a6 6 0 0 1-6 6H82z" />
        <path d="M28 70V60a32 32 0 0 1 64 0v10" />
        <path d="M22 66h16v28H28a6 6 0 0 1-6-6zM82 66h16v22a6 6 0 0 1-6 6H82z" />
      </>
    ),
  },
  Fashion: {
    hue: 330,
    draw: (
      <path className="fill" d="M42 28 28 36 16 54l14 9 8-11v44h44V52l8 11 14-9-12-18-14-8q-6 12-18 12T42 28z" />
    ),
  },
  Accessories: {
    hue: 32,
    draw: (
      <>
        <rect className="fill" x="48" y="16" width="24" height="22" rx="5" />
        <rect className="fill" x="48" y="82" width="24" height="22" rx="5" />
        <circle cx="60" cy="60" r="25" className="fill-strong" />
        <circle cx="60" cy="60" r="25" />
        <path d="M60 60V46M60 60l9 6" />
      </>
    ),
  },
  Beauty: {
    hue: 350,
    draw: (
      <>
        <rect className="fill" x="26" y="50" width="30" height="48" rx="9" />
        <rect x="35" y="36" width="12" height="14" rx="3" />
        <rect className="fill-strong" x="68" y="64" width="22" height="34" rx="4" />
        <path d="M71 64V46h16v18M71 46V34l16-7v19" />
      </>
    ),
  },
  Home: {
    hue: 150,
    draw: (
      <>
        <path className="fill" d="M42 26h36l12 32H30z" />
        <path d="M60 58v34M44 98h32l-4-6H48z" />
      </>
    ),
  },
  Sports: {
    hue: 20,
    draw: (
      <>
        <circle cx="60" cy="60" r="32" className="fill" />
        <circle cx="60" cy="60" r="32" />
        <path d="M28 60h64M60 28v64M38 37q16 23 0 46M82 37q-16 23 0 46" />
      </>
    ),
  },
  Books: {
    hue: 215,
    draw: (
      <>
        <path className="fill" d="M60 38q-16-10-38-8v58q22-2 38 8 16-10 38-8V30q-22-2-38 8z" />
        <path d="M60 38v58M32 46q12 0 20 4M32 58q12 0 20 4M68 50q8-4 20-4M68 62q8-4 20-4" />
      </>
    ),
  },
  Kitchen: {
    hue: 190,
    draw: (
      <>
        <path className="fill" d="M28 54h64v28a12 12 0 0 1-12 12H40a12 12 0 0 1-12-12z" />
        <path d="M32 54q28-22 56 0M28 62H16M92 62h12" />
        <circle cx="60" cy="38" r="4" />
        <path d="M48 26q-4-6 0-12M60 24q-4-6 0-12M72 26q-4-6 0-12" />
      </>
    ),
  },
  Grocery: {
    hue: 95,
    draw: (
      <>
        <circle className="fill-strong" cx="48" cy="46" r="12" />
        <circle className="fill" cx="72" cy="44" r="13" />
        <path d="M72 31q2-8 9-10" />
        <path className="fill" d="M20 58h80l-9 36H29z" />
        <path d="M44 66v20M60 66v20M76 66v20" />
      </>
    ),
  },
  Toys: {
    hue: 280,
    draw: (
      <>
        <rect className="fill" x="26" y="64" width="30" height="30" rx="5" />
        <rect className="fill-strong" x="64" y="64" width="30" height="30" rx="5" />
        <rect className="fill" x="45" y="30" width="30" height="30" rx="5" transform="rotate(-8 60 45)" />
        <circle cx="41" cy="79" r="5" />
        <path d="M72 79h14M79 72v14" />
        <path d="M54 46l6-7 6 7" transform="rotate(-8 60 45)" />
      </>
    ),
  },
};

export function categoryHue(category: string) {
  return ART[category]?.hue ?? 258;
}

export function CategoryArt({ category }: { category: string }) {
  const art = ART[category];
  return (
    <span className="category-art" style={{ '--hue': art?.hue ?? 258 } as CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {art?.draw ?? <rect className="fill" x="30" y="30" width="60" height="60" rx="10" />}
      </svg>
    </span>
  );
}
