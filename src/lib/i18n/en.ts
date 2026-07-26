/**
 * English string catalogue. §12 requires all UI strings externalised; Q6 (the
 * launch language list) is not due until the design phase, so strings go through
 * t() from the first screen with an en-only map. No i18n library is installed
 * until Q6 answers whether there is even a second language — the swap from this
 * typed map to any library is mechanical.
 */

export const en = {
  'common.readOnly': 'Read-only',
  'common.viewingAs': 'Viewing as',
  'common.allEstates': 'all estates',
  'common.nothingHere': 'Nothing here yet',
  'common.comingSoon': 'This surface is scaffolded — screens land next.',
  'common.new': 'New',
  'common.search': 'Search…',
  'common.total': 'Total',
  'common.overdue': 'Overdue',
  'common.dueSoon': 'Due soon',
  'nav.signOut': 'Sign out',
} as const;

export type StringKey = keyof typeof en;
