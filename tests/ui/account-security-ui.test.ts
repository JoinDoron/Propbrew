import { createElement, isValidElement, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSecurityPanel, manualTotpSecret } from '@/components/auth/account-security-panel';

const client = vi.hoisted(() => ({ enable: vi.fn(), verifyTotp: vi.fn(), disable: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { twoFactor: client } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: client.refresh }) }));
const hooks = vi.hoisted(() => ({ active: false, cursor: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useState(initial: unknown) {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++; if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value; }];
    },
    useRef(initial: unknown) {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.cursor++; if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }; return hooks.slots[index];
    },
    useId() { return hooks.active ? `security-${hooks.cursor++}` : actual.useId(); },

  };
});
type Props = { children?: ReactNode; name?: string; value?: string; onSubmit?: (event: FormEvent<HTMLFormElement>) => void; onClick?: () => void };
function elements(root: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(root)) return root.flatMap(elements);
  if (!isValidElement<Props>(root)) return [];
  return [root, ...elements(root.props.children)];
}
function tree(enabled = false) { hooks.active = true; hooks.cursor = 0; try { return AccountSecurityPanel({ twoFactorEnabled: enabled, email: 'ada@example.test' }); } finally { hooks.active = false; } }
const setup = { method: 'totp', totpURI: 'otpauth://totp/Propbrew:ada?secret=JBSWY3DPEHPK3PXP&issuer=Propbrew', backupCodes: ['backup-one', 'backup-two'] };
const reset = vi.fn();
function event(values: Record<string, string>) { return { preventDefault: vi.fn(), currentTarget: { values, reset } } as unknown as FormEvent<HTMLFormElement>; }
async function flush() { for (let index = 0; index < 10; index++) await Promise.resolve(); }
beforeEach(() => {
  hooks.active = false; hooks.cursor = 0; hooks.slots = []; vi.clearAllMocks();
  client.enable.mockResolvedValue({ data: setup, error: null }); client.verifyTotp.mockResolvedValue({ data: { status: true }, error: null }); client.disable.mockResolvedValue({ data: { status: true }, error: null });
  vi.stubGlobal('FormData', class { constructor(private form: { values: Record<string, string> }) {} get(key: string) { return this.form.values[key]; } });
});
afterEach(() => vi.unstubAllGlobals());

describe('local authenticator account security UI', () => {
  it('renders truthful enabled/not-enabled states with current-password reauthentication', () => {
    const disabled = renderToStaticMarkup(createElement(AccountSecurityPanel, { twoFactorEnabled: false }));
    expect(disabled).toContain('Not enabled'); expect(disabled).toContain('Set up authenticator'); expect(disabled).toContain('autoComplete="current-password"');
    const enabled = renderToStaticMarkup(createElement(AccountSecurityPanel, { twoFactorEnabled: true }));
    expect(enabled).toContain('Enabled'); expect(enabled).toContain('Turn off two-step verification');
    expect(client.enable).not.toHaveBeenCalled(); expect(client.disable).not.toHaveBeenCalled();
  });

  it('accepts only a valid local authenticator setup URI', () => {
    expect(manualTotpSecret(setup.totpURI)).toBe('JBSWY3DPEHPK3PXP');
    for (const uri of ['invalid', 'https://example.test/?secret=JBSWY3DP', 'otpauth://totp/app?secret=invalid-secret!', 'otpauth://totp/app']) expect(manualTotpSecret(uri)).toBeNull();
  });

  it('verifies setup before displaying one-time recovery codes and never persists setup secrets in browser storage', async () => {
    const storage = vi.fn(); const fetch = vi.fn(); vi.stubGlobal('localStorage', { setItem: storage }); vi.stubGlobal('fetch', fetch);
    let view = tree(); elements(view).find((element) => element.type === 'form')!.props.onSubmit!(event({ password: 'private-passphrase' }));
    await flush();
    expect(client.enable).toHaveBeenCalledWith({ password: 'private-passphrase', method: 'totp' }); expect(reset).toHaveBeenCalledOnce();
    view = tree();
    expect(elements(view).some((element) => element.type === 'input' && element.props.value === 'JBSWY3DPEHPK3PXP')).toBe(true);
    expect(JSON.stringify(view)).not.toContain('backup-one');
    elements(view).find((element) => element.type === 'form')!.props.onSubmit!(event({ code: '123456' })); await flush();
    expect(client.verifyTotp).toHaveBeenCalledWith({ code: '123456' });
    view = tree(); expect(JSON.stringify(view)).toContain('backup-one'); expect(JSON.stringify(view)).not.toContain('JBSWY3DPEHPK3PXP');
    elements(view).find((element) => element.type === 'button' && Array.isArray(element.props.children) && element.props.children.includes('I saved my codes'))!.props.onClick!();
    view = tree(); expect(JSON.stringify(view)).not.toContain('backup-one'); expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps setup in place on an invalid code and prevents duplicate requests while the first is pending', async () => {
    let release!: (value: unknown) => void;
    client.enable.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    let view = tree(); const form = elements(view).find((element) => element.type === 'form')!;
    form.props.onSubmit!(event({ password: 'private-passphrase' })); form.props.onSubmit!(event({ password: 'private-passphrase' }));
    expect(client.enable).toHaveBeenCalledOnce(); release({ data: setup, error: null }); await flush();
    client.verifyTotp.mockResolvedValueOnce({ data: null, error: { message: 'Invalid code' } });
    view = tree(); elements(view).find((element) => element.type === 'form')!.props.onSubmit!(event({ code: '000000' })); await flush();
    view = tree(); expect(JSON.stringify(view)).toContain('Invalid code'); expect(JSON.stringify(view)).toContain('JBSWY3DPEHPK3PXP'); expect(JSON.stringify(view)).not.toContain('backup-one');
  });
});
