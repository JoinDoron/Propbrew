/**
 * Brand configuration — the single source of truth for white-labelling.
 *
 * Reeve is a multi-tenant platform, so these are the *platform* defaults.
 * Per-tenant branding (PRD §8.2, "Per-tenant configuration") overrides them at
 * runtime once tenant configuration lands.
 */

export const brand = {
  /** Product name shown in the sidebar, auth screen and document title. */
  name: 'Reeve',
  /** Small caps label under the wordmark in the sidebar. */
  tagline: 'FACILITY & ESTATE',
  /** Primary brand colour. Drives --primary and every accent in the UI. */
  primaryColor: '#2563eb',
  /** The organisation this deployment is built for. */
  client: '7 Fifteen Capital',
} as const;

/** Palette options offered to tenants for per-tenant branding. */
export const PRIMARY_PRESETS = [
  { label: 'Blue', value: '#2563eb' },
  { label: 'Violet', value: '#8442ff' },
  { label: 'Green', value: '#0e9f6e' },
  { label: 'Red', value: '#e0533d' },
  { label: 'Slate', value: '#0f172a' },
] as const;

export type Theme = 'light' | 'dark';
