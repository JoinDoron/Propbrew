import { getNativeAuth } from '@/server/auth/auth';
import { nativeAuthEnabled } from '@/server/auth/mode';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const allowed=new Set(['ok','get-session','sign-up/email','sign-in/email','sign-out','two-factor/enable','two-factor/disable','two-factor/verify-totp','two-factor/verify-backup-code','two-factor/get-totp-uri','two-factor/generate-backup-codes','list-sessions','revoke-session','revoke-other-sessions','change-password']);
async function handle(request:Request) {
 const path=new URL(request.url).pathname.slice('/api/auth/'.length);
 if(!nativeAuthEnabled()||!allowed.has(path))return new Response('Not found',{status:404});
 return getNativeAuth().handler(request);
}
export const GET=handle;
export const POST=handle;
