// Font Awesome Free (bundled from npm, so icons work offline).
// `flip` mirrors direction icons (arrows, chevrons) in the Urdu right-to-left layout.
export default function Icon({ name, brand, flip, spin, className = '' }) {
  const cls = [brand ? 'fa-brands' : 'fa-solid', `fa-${name}`, flip && 'flip', spin && 'fa-spin', className];
  return <i className={cls.filter(Boolean).join(' ')} aria-hidden="true" />;
}

// The doodh wala bicycle with milk cans from the app logo, drawn in the current text colour.
export function BikeIcon({ className = '' }) {
  return (
    <svg className={`bikeicon ${className}`} viewBox="70 128 372 290" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="146" cy="346" r="58" />
        <circle cx="370" cy="346" r="58" />
        <path d="M146 346 L214 262 L254 346 Z M254 346 L336 262 L214 262 M336 262 L370 346 M336 262 L326 222 M302 222 H348" />
        <path d="M86 262 H210 M100 262 L146 346" />
      </g>
      <g fill="currentColor">
        <path d="M84 250 V196 Q84 180 98 174 L104 160 H126 L132 174 Q144 180 144 196 V250 Z" />
        <rect x="98" y="138" width="34" height="16" rx="5" />
        <path d="M152 250 V196 Q152 180 166 174 L172 160 H194 L200 174 Q212 180 212 196 V250 Z" />
        <rect x="166" y="138" width="34" height="16" rx="5" />
      </g>
    </svg>
  );
}
