'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/ui/page-header';
import { authClient } from '@/lib/auth-client';
import shared from '@/components/ui/workspace-layout.module.css';
import styles from './auth.module.css';

type Setup = { secret: string; backupCodes: string[] };
export function manualTotpSecret(uri: string): string | null {
  try { const url = new URL(uri); const secret = url.searchParams.get('secret'); return url.protocol === 'otpauth:' && secret && /^[A-Z2-7]+=*$/i.test(secret) ? secret : null; }
  catch { return null; }
}

export function AccountSecurityPanel({ twoFactorEnabled, email }: { twoFactorEnabled: boolean; email?: string }) {
  const id = useId();
  const router = useRouter();
  const [enabled, setEnabled] = useState(twoFactorEnabled);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  async function execute(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(''); setNotice('');
    try { await work(); }
    catch { setError('The security change could not be confirmed. Please try again.'); }
    finally { inFlight.current = false; setPending(false); }
  }
  function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const password = String(new FormData(form).get('password') ?? '');
    void execute(async () => {
      const result = await authClient.twoFactor.enable({ password, method: 'totp' });
      if (result.error) { setError(result.error.message || 'Two-step verification could not be prepared.'); return; }
      if (!result.data || result.data.method !== 'totp') { setError('The authenticator setup could not be confirmed. Please restart setup.'); return; }
      const secret = manualTotpSecret(result.data.totpURI);
      if (!secret || !Array.isArray(result.data.backupCodes)) { setError('The authenticator setup could not be confirmed. Please restart setup.'); return; }
      form.reset(); setSetup({ secret, backupCodes: result.data.backupCodes });
    });
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const code = String(new FormData(event.currentTarget).get('code') ?? '');
    void execute(async () => {
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) { setError(result.error.message || 'Check the authenticator code and try again.'); return; }
      setRecovery(setup?.backupCodes ?? []); setSetup(null); setEnabled(true); setNotice('Two-step verification is enabled. Save your recovery codes.'); router.refresh();
    });
  }
  function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const password = String(new FormData(form).get('password') ?? '');
    void execute(async () => {
      const result = await authClient.twoFactor.disable({ password });
      if (result.error) { setError(result.error.message || 'Two-step verification could not be turned off.'); return; }
      form.reset(); setSetup(null); setRecovery(null); setEnabled(false); setNotice('Two-step verification is turned off.'); router.refresh();
    });
  }
  async function copy(value: string, message: string) {
    try { await navigator.clipboard.writeText(value); setNotice(message); }
    catch { setNotice('Select the value shown and copy it.'); }
  }
  return <div className={`pb-page ${shared.layout}`}><PageHeader title="Account security" subtitle={email ? `Protect the account for ${email}.` : 'Protect your account across every company you belong to.'} />
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.success}>{notice}</p>}
    <Card><CardHeader title="Two-step verification" subtitle="Use an authenticator app with offline codes" action={<StatusPill status={enabled ? 'Enabled' : 'Not enabled'} tone={enabled ? 'success' : 'warn'} />} /><p className={shared.body}>An authenticator adds a short code when you sign in. Keep your recovery codes somewhere safe so you can regain access if you lose your phone.</p>
      {recovery ? <section className={styles.securitySection} aria-labelledby={`${id}-recovery`}><h2 id={`${id}-recovery`}>Save your recovery codes</h2><p className={styles.hint}>These codes are shown in this setup once. Each code can be used once to sign in.</p><ul className={styles.recoveryCodes}>{recovery.map((code) => <li key={code}><code>{code}</code></li>)}</ul><div className={styles.memberActions}><button type="button" className={styles.secondary} onClick={() => void copy(recovery.join('\n'), 'Recovery codes copied.')}><Copy size={16} aria-hidden="true" />Copy codes</button><button type="button" className={styles.primary} onClick={() => { setRecovery(null); setNotice('Recovery codes hidden. Two-step verification is enabled.'); }}><Check size={16} aria-hidden="true" />I saved my codes</button></div></section>
        : setup ? <section className={styles.securitySection} aria-labelledby={`${id}-setup`}><h2 id={`${id}-setup`}>Connect your authenticator</h2><ol className={styles.setupSteps}><li>Open your authenticator app and choose to add an account manually.</li><li>Choose a time-based code and enter this setup key.</li><li>Enter the code from your app below to finish.</li></ol><div className={styles.field}><label htmlFor={`${id}-secret`}>Authenticator setup key</label><input id={`${id}-secret`} value={setup.secret} readOnly autoComplete="off" onFocus={(event) => event.target.select()} /></div><button type="button" className={styles.secondary} onClick={() => void copy(setup.secret, 'Authenticator setup key copied.')}><Copy size={16} aria-hidden="true" />Copy setup key</button><form className={styles.form} onSubmit={verify} aria-busy={pending}><fieldset className={styles.fieldset} disabled={pending}><legend className="sr-only">Confirm authenticator setup</legend><div className={styles.field}><label htmlFor={`${id}-code`}>Authenticator code</label><input id={`${id}-code`} name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} /></div><button type="submit" className={styles.primary} disabled={pending}><ShieldCheck size={17} aria-hidden="true" />{pending ? 'Verifying…' : 'Verify & enable'}</button></fieldset></form></section>
          : <form className={`${styles.form} ${styles.securitySection}`} onSubmit={enabled ? disable : enable} aria-busy={pending}><fieldset className={styles.fieldset} disabled={pending}><legend className="sr-only">{enabled ? 'Turn off two-step verification' : 'Enable two-step verification'}</legend><div className={styles.field}><label htmlFor={`${id}-password`}>Confirm your password</label><input id={`${id}-password`} name="password" type="password" required autoComplete="current-password" maxLength={128} /></div><button type="submit" className={enabled ? styles.secondary : styles.primary} disabled={pending}><KeyRound size={17} aria-hidden="true" />{pending ? 'Updating security…' : enabled ? 'Turn off two-step verification' : 'Set up authenticator'}</button></fieldset></form>}
    </Card>
  </div>;
}
