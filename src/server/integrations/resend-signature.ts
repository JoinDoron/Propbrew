import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Resend signs the unmodified request body with Svix's v1 HMAC format. */
export function verifyResendSignature(raw: string, headers: Headers, secret = process.env.RESEND_WEBHOOK_SECRET, now = Date.now()): boolean {
  const id = headers.get('svix-id'), timestamp = headers.get('svix-timestamp'), signatures = headers.get('svix-signature');
  if (!secret?.startsWith('whsec_') || !id || !timestamp || !signatures || !/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 5 * 60_000) return false;
  const key = Buffer.from(secret.slice(6), 'base64');
  if (key.length < 16) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest();
  return signatures.split(' ').some((item) => {
    if (!item.startsWith('v1,')) return false;
    const signature = Buffer.from(item.slice(3), 'base64');
    return signature.length === expected.length && timingSafeEqual(signature, expected);
  });
}
