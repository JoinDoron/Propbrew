import 'server-only';

import { NOW, NOW_MS } from '@/domain/ppm';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { nowISO } from '@/server/clock';

/** Demo fixtures retain their reference date. Company operations evaluate the
 * clock when each request runs; business dates follow West Africa Time. */
export function operatingClock() {
  const native = nativeAuthEnabled();
  if (!native) return { iso: NOW, nowMs: NOW_MS, dateISO: NOW, native };
  const iso = nowISO();
  const nowMs = Date.parse(iso);
  if (!Number.isFinite(nowMs)) throw new Error('The operating clock is unavailable.');
  const dateISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
  return { iso, nowMs, dateISO, native };
}
export const operatingNowISO = () => operatingClock().iso;
export const operatingNowMs = () => operatingClock().nowMs;
export const operatingDateISO = () => operatingClock().dateISO;
