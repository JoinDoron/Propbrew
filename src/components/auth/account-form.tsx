'use client';

import Link from 'next/link';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { AuthFrame } from './auth-frame';
import styles from './auth.module.css';

export type AccountFormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };
export type AccountFormAction = (state: AccountFormState, data: FormData) => Promise<AccountFormState>;

export function AccountForm({ mode, action, minPasswordLength = 12, invitationToken }: { mode: 'signup' | 'login'; action: AccountFormAction; minPasswordLength?: number; invitationToken?: string }) {
  const signup = mode === 'signup';
  const invited = typeof invitationToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(invitationToken);
  const suffix = invited ? `?invite=${encodeURIComponent(invitationToken)}` : '';
  const prefix = useId();
  const [state, formAction, pending] = useActionState(action, {});
  const [visible, setVisible] = useState(false);
  const [values, setValues] = useState({ name: '', email: '', password: '', companyName: '' });
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error || Object.keys(state.fieldErrors ?? {}).length) feedback.current?.focus(); }, [state]);
  const error = (name: string) => state.fieldErrors?.[name]?.join(' ');
  const title = signup ? invited ? 'Join your company on Propbrew' : 'Start your company workspace' : 'Welcome back';
  const field = (name: 'name' | 'email' | 'companyName', label: string, autoComplete: string, placeholder: string) => {
    const problem = error(name);
    return <div className={styles.field}><label htmlFor={`${prefix}-${name}`}>{label}</label><input id={`${prefix}-${name}`} name={name} type={name === 'email' ? 'email' : 'text'} autoComplete={autoComplete} required maxLength={name === 'email' ? 254 : 120} value={values[name]} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={placeholder} aria-invalid={Boolean(problem)} aria-describedby={problem ? `${prefix}-${name}-error` : undefined} />{problem && <p id={`${prefix}-${name}-error`} className={styles.fieldError}>{problem}</p>}</div>;
  };
  return <AuthFrame title={title} description={invited ? signup ? 'Create your account with the email address your company invited. Your workspace access follows the invitation.' : 'Sign in with the invited email address to continue to your company invitation.' : signup ? 'Create your account and a company for your team. Start with a clean portfolio, then add the workspaces you need.' : 'Sign in to your account to continue with your company and its workspaces.'} footer={signup ? <>Already have an account? <Link href={`/login${suffix}`}>Sign in</Link></> : <>New to Propbrew? <Link href={`/sign-up${suffix}`}>{invited ? 'Create your account' : 'Create your company'}</Link></>}>
    <form action={formAction} className={styles.form} aria-busy={pending}>
      {invited && <input type="hidden" name="invitationToken" value={invitationToken} />}
      {(state.error || Object.keys(state.fieldErrors ?? {}).length > 0) && <div ref={feedback} role="alert" tabIndex={-1} className={styles.error}>{state.error || 'Please review the highlighted fields.'}</div>}
      <fieldset disabled={pending} className={styles.fieldset}><legend className="sr-only">{signup ? 'Create account details' : 'Sign in details'}</legend>
        {signup && field('name', 'Your full name', 'name', 'e.g. Ada Okafor')}
        {field('email', 'Email address', 'email', 'you@company.com')}
        {signup && !invited && field('companyName', 'Company name', 'organization', 'e.g. Palm Court Properties')}
        <div className={styles.field}><label htmlFor={`${prefix}-password`}>Password</label><div className={styles.password}><input id={`${prefix}-password`} name="password" type={visible ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? minPasswordLength : undefined} maxLength={128} value={values.password} onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))} aria-invalid={Boolean(error('password'))} aria-describedby={`${prefix}-password-hint${error('password') ? ` ${prefix}-password-error` : ''}`} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div><p id={`${prefix}-password-hint`} className={styles.hint}>{signup ? `Use at least ${minPasswordLength} characters. A longer, unique passphrase works well.` : 'Use the password you created for your Propbrew account.'}</p>{error('password') && <p id={`${prefix}-password-error`} className={styles.fieldError}>{error('password')}</p>}</div>
        <button type="submit" className={styles.primary} disabled={pending}>{pending ? <><LoaderCircle size={17} className={styles.spinner} aria-hidden="true" />{signup ? 'Creating your account…' : 'Signing in…'}</> : <>{signup ? invited ? 'Create account & join' : 'Create account & company' : 'Sign in'}<ArrowRight size={17} aria-hidden="true" /></>}</button>
      </fieldset>
      <p className={styles.hint}>{invited ? 'Your invitation is checked against the account you sign in with.' : signup ? 'Your company starts with its own records. You can invite teammates and assign their workspace access after setup.' : 'Your company access is checked when you sign in.'}</p>
    </form>
  </AuthFrame>;
}
