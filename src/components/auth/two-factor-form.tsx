'use client';

import { useActionState, useId, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { AuthFrame } from './auth-frame';
import type { AccountFormAction } from './account-form';
import styles from './auth.module.css';

export function TwoFactorForm({ action, allowBackupCode = true, invitationToken }: { action: AccountFormAction; allowBackupCode?: boolean; invitationToken?: string }) {
  const id = useId();
  const [state, submit, pending] = useActionState(action, {});
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState('');
  const field = backup ? 'backupCode' : 'code';
  const error = state.fieldErrors?.[field]?.join(' ');
  return <AuthFrame title="Verify it’s you" description={backup ? 'Use one of the recovery codes you saved when you enabled two-step verification.' : 'Enter the six-digit code from your authenticator app to finish signing in.'} footer={<span className={styles.securityFoot}><ShieldCheck size={15} aria-hidden="true" />Your account has an extra layer of protection.</span>}><form action={submit} className={styles.form} aria-busy={pending}>{typeof invitationToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(invitationToken) && <input type="hidden" name="invitationToken" value={invitationToken} />}{state.error && <p role="alert" className={styles.error}>{state.error}</p>}<fieldset disabled={pending} className={styles.fieldset}><legend className="sr-only">Second-factor verification</legend><div className={styles.field}><label htmlFor={`${id}-code`}>{backup ? 'Recovery code' : 'Authenticator code'}</label><input key={field} id={`${id}-code`} name={field} required type="text" inputMode={backup ? 'text' : 'numeric'} autoComplete={backup ? 'off' : 'one-time-code'} spellCheck={false} minLength={backup ? undefined : 6} maxLength={backup ? 128 : 6} pattern={backup ? undefined : '[0-9]{6}'} value={code} onChange={(event) => setCode(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} /><p id={`${id}-hint`} className={styles.hint}>{backup ? 'Each recovery code can be used once.' : 'Authenticator codes work even when your phone has no mobile signal.'}</p>{error && <p id={`${id}-error`} className={styles.fieldError}>{error}</p>}</div><button type="submit" className={styles.primary} disabled={pending}><KeyRound size={17} aria-hidden="true" />{pending ? 'Verifying…' : 'Verify & continue'}</button>{allowBackupCode && <button type="button" className={styles.secondary} disabled={pending} onClick={() => { setBackup((value) => !value); setCode(''); }}>{backup ? 'Use my authenticator app' : 'Use a recovery code'}</button>}</fieldset></form></AuthFrame>;
}
