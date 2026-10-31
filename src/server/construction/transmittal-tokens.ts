import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idPattern = /^tr-new-[1-9][0-9]{0,12}$/;

export type TransmittalClaim = { tenantId: string; id: string; expiresISO: string };
function key(): string {
  const value = process.env.CONSTRUCTION_TRANSMITTAL_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error('The external transmittal signing secret is unavailable.');
  return value;
}

/** The signed link is a bearer receipt for one transmittal, never a company login. */
export function signTransmittalClaim(claim: TransmittalClaim): string {
  if (!uuid.test(claim.tenantId) || !idPattern.test(claim.id) || !Number.isFinite(Date.parse(claim.expiresISO))) throw new Error('Invalid transmittal link.');
  const payload = Buffer.from(JSON.stringify(claim), 'utf8').toString('base64url');
  return `${payload}.${createHmac('sha256', key()).update(payload).digest('base64url')}`;
}

export function verifyTransmittalClaim(token: string, now = Date.now()): TransmittalClaim | null {
  if (token.length > 500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', key()).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TransmittalClaim;
    if (!uuid.test(claim.tenantId) || !idPattern.test(claim.id) || !Number.isFinite(Date.parse(claim.expiresISO)) || Date.parse(claim.expiresISO) <= now) return null;
    return claim;
  } catch { return null; }
}
