/**
 * Brand configuration — the single source of truth for white-labelling.
 *
 * Ported from the Cargoflow TMS template, which exposed exactly two
 * configurable props: `companyName` and `primaryColor`. Changing the values
 * here re-skins the entire application.
 */

export const brand = {
  /** Product name shown in the sidebar, auth screen and document title. */
  name: 'Cargoflow',
  /** Small caps label under the wordmark in the sidebar. */
  tagline: 'FREIGHT TMS',
  /** Primary brand colour. Drives --primary and every accent in the UI. */
  primaryColor: '#2563eb',
} as const;

/** The five presets the original template shipped with. */
export const PRIMARY_PRESETS = [
  { label: 'Violet', value: '#8442ff' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Green', value: '#0e9f6e' },
  { label: 'Red', value: '#e0533d' },
  { label: 'Slate', value: '#0f172a' },
] as const;

export type Theme = 'light' | 'dark';
