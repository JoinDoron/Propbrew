'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getNativeAuth } from '@/server/auth/auth';
import { authDatabasePool } from '@/server/auth/database';
import { consumeAuthAttempt, provisionCompany,invitationHash,activateCompany } from '@/server/auth/company';
import { withAuthTransaction } from '@/server/auth/database';

type FormState = { error?: string; fieldErrors?: Record<string,string[]|undefined> };
const credentials = z.object({ email: z.email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(12).max(128) });
const signup = credentials.extend({ name: z.string().trim().min(2).max(120), companyName: z.string().trim().min(2).max(120) });
const submitted = (form: FormData, names: string[]) => Object.fromEntries(names.map((key) => [key, String(form.get(key) ?? '')]));
const errorState = (error: z.ZodError): FormState => ({ error: 'Review the highlighted details.', fieldErrors: z.flattenError(error).fieldErrors });

export async function registerAccount(_state: FormState, form: FormData): Promise<FormState> {
  const invitationToken=String(form.get('invitationToken')??'');
  if(invitationToken&&!/^[A-Za-z0-9_-]{43}$/.test(invitationToken))return {error:'This invitation is unavailable.'};
  const parsed = signup.safeParse({...submitted(form,['name','email','password','companyName']),...(invitationToken?{companyName:'Invited teammate'}:{})});
  if (!parsed.success) return errorState(parsed.error);
  const { name,email,password,companyName } = parsed.data;
  let created: { user: { id: string; name: string; email: string }; token: string | null };
  try {
    const auth = getNativeAuth();
    created = await auth.api.signUpEmail({ headers: await headers(), body: { name,email,password } });
  } catch { return { error: 'We could not create this account. Check your details or sign in if you already have an account.' }; }
  try {
    if (!created.token) throw new Error('No account session.');
    const session = await authDatabasePool().query('select id from auth_sessions where token=$1 and "userId"=$2::uuid and "expiresAt">now()', [created.token,created.user.id]);
    if (session.rowCount !== 1) throw new Error('No account session.');
    const identity={user:created.user,session:{id:session.rows[0].id}};
    if(invitationToken) {
      const companyId=await withAuthTransaction(identity.user.id,async(client)=>(await client.query('select accept_company_invitation($1) id',[invitationHash(invitationToken)])).rows[0].id);
      await activateCompany(identity,companyId);
    } else await provisionCompany(identity,companyName);
  } catch { redirect(invitationToken?`/invite/${invitationToken}`:'/companies?setup=retry'); }
  redirect('/workspaces');
}

export async function loginAccount(_state: FormState, form: FormData): Promise<FormState> {
  const invitationToken=String(form.get('invitationToken')??'');
  if(invitationToken&&!/^[A-Za-z0-9_-]{43}$/.test(invitationToken))return {error:'This invitation is unavailable.'};
  const parsed = credentials.safeParse(submitted(form,['email','password']));
  if (!parsed.success) return { error: 'Enter your email and password.' };
  let secondFactor = false;
  try {
    const auth = getNativeAuth();
    const response = await auth.api.signInEmail({ headers: await headers(), body: parsed.data });
    secondFactor = 'twoFactorRedirect' in response && response.twoFactorRedirect === true;
  } catch { return { error: 'We could not sign you in. Check your email and password, or try again later.' }; }
  redirect(secondFactor ? '/login/two-factor'+(invitationToken?`?invite=${invitationToken}`:'') : invitationToken?`/invite/${invitationToken}`:'/companies');
}

export async function verifySecondFactor(_state: FormState, form: FormData): Promise<FormState> {
  const invitationToken=String(form.get('invitationToken')??'');
  if(invitationToken&&!/^[A-Za-z0-9_-]{43}$/.test(invitationToken))return {error:'This invitation is unavailable.'};
  const code = String(form.get('code') ?? ''), backupCode = String(form.get('backupCode') ?? '');
  if ((!!code === !!backupCode) || (code && !/^\d{6}$/.test(code)) || backupCode.length>128) return { error: 'Enter one valid authenticator or recovery code.' };
  try {
    const auth = getNativeAuth();
    await consumeAuthAttempt('two-factor-global','all',100,60);
    if (code) await auth.api.verifyTOTP({headers:await headers(),body:{code,trustDevice:false}});
    else await auth.api.verifyBackupCode({headers:await headers(),body:{code:backupCode,trustDevice:false}});
  } catch { return { error: 'That code could not be verified. Try a current code or a recovery code.' }; }
  redirect(invitationToken?`/invite/${invitationToken}`:'/companies');
}
