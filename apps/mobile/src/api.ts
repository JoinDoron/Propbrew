import * as SecureStore from 'expo-secure-store';

const origin = process.env.EXPO_PUBLIC_API_URL ?? 'https://usepropbrew.com';
const COOKIE_KEY = 'propbrew.session.cookie';

async function request(path: string, init: RequestInit = {}) {
  const cookie = await SecureStore.getItemAsync(COOKIE_KEY);
  const response = await fetch(`${origin}${path}`, { ...init, headers: { accept: 'application/json', ...(cookie ? { cookie } : {}), ...init.headers } });
  const nextCookie = response.headers.get('set-cookie');
  const sessionCookie = nextCookie?.split(';')[0];
  if (sessionCookie) await SecureStore.setItemAsync(COOKIE_KEY, sessionCookie);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Propbrew could not complete this request.');
  return body;
}

export async function signIn(email: string, password: string) {
  await request('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
}
export const bootstrap = () => request('/api/mobile/v1/bootstrap');
export const mutate = (body: Record<string, unknown>) => request('/api/mobile/v1/actions', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) });
