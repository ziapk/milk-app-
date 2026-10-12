// Urdu fonts are bundled (not loaded from Google Fonts) so they work offline in the APK.
// Only the Arabic-script subset is included; English letters fall through to the system font.
import '@fontsource/noto-nastaliq-urdu/arabic-400.css';
import '@fontsource/noto-nastaliq-urdu/arabic-700.css';
import '@fontsource/noto-naskh-arabic/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-700.css';
import '@fontsource/gulzar/arabic-400.css';

export const URDU_FONTS = {
  nastaliq: 'Noto Nastaliq Urdu',
  gulzar: 'Gulzar',
  naskh: 'Noto Naskh Arabic',
};

export const fontStack = (key) => `"${URDU_FONTS[key] || URDU_FONTS.nastaliq}", system-ui, -apple-system, Roboto, sans-serif`;

// Canvas only draws with fonts that are already loaded, so load the chosen one first.
export async function loadFont(key) {
  const name = URDU_FONTS[key] || URDU_FONTS.nastaliq;
  try {
    await Promise.all([document.fonts.load(`400 32px "${name}"`, 'اردو'), document.fonts.load(`700 32px "${name}"`, 'اردو')]);
  } catch {
    // Falls back to the system Urdu font.
  }
}
