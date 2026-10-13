// Font Awesome Free (bundled from npm, so icons work offline).
// `flip` mirrors direction icons (arrows, chevrons) in the Urdu right-to-left layout.
export default function Icon({ name, brand, flip, spin, className = '' }) {
  const cls = [brand ? 'fa-brands' : 'fa-solid', `fa-${name}`, flip && 'flip', spin && 'fa-spin', className];
  return <i className={cls.filter(Boolean).join(' ')} aria-hidden="true" />;
}

