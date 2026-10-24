import 'server-only';
import crypto from 'node:crypto';

export function timingSafeSignature(raw: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  const a = Buffer.from(signature.replace(/^sha512=/, ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function timingSafeSecret(value: string | null, secret: string | undefined): boolean {
  if (!value || !secret) return false;
  const a = Buffer.from(value, 'utf8'); const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
