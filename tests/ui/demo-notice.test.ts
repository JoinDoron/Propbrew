import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoNotice } from '@/components/auth/demo-notice';

const hooks = vi.hoisted(() => ({ active: false, cursor: 0, slots: [] as unknown[], pending: false }));
const actions = vi.hoisted(() => ({ reset: vi.fn<(state: unknown, form: FormData) => Promise<{ error?: string; message?: string }>>(async () => ({ message: 'Sample data restored.' })), signOut: vi.fn(), clearOwner: vi.fn() }));
vi.mock('@/server/actions/demo-auth', () => ({ resetDemoSandbox: actions.reset }));
vi.mock('@/server/actions/auth', () => ({ signOut: actions.signOut }));
vi.mock('@/lib/offline/outbox', () => ({ clearOwnerOutbox: actions.clearOwner }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useId() { return hooks.active ? `demo-notice-${hooks.cursor++}` : actual.useId(); },
    useState(initial: unknown) {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++; if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value; }];
    },
    useRef(initial: unknown) {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.cursor++; if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }; return hooks.slots[index];
    },
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) { if (!hooks.active) return actual.useEffect(effect, dependencies); },
    useActionState(action: (state: unknown, form: FormData) => Promise<unknown>, initial: unknown) {
      if (!hooks.active) return actual.useActionState(action, initial);
      const index = hooks.cursor++; if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], async (form: FormData) => { hooks.slots[index] = await action(hooks.slots[index], form); }, hooks.pending];
    },
  };
});
type Props = { children?: ReactNode; name?: string; value?: string; type?: string; disabled?: boolean; 'aria-expanded'?: boolean; onClick?: () => void; action?: (form: FormData) => Promise<void> };
function elements(root: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(root)) return root.flatMap(elements);
  return isValidElement<Props>(root) ? [root, ...elements(root.props.children)] : [];
}
function notice(editable = true, outboxOwner?: string) { hooks.active = true; hooks.cursor = 0; try { return DemoNotice({ editable, outboxOwner }); } finally { hooks.active = false; } }
const html = (value: ReactNode) => renderToStaticMarkup(createElement('div', null, value));
const disclosure = (value: ReactNode) => elements(value).find((element) => element.type === 'button' && element.props['aria-expanded'] !== undefined)!;
const resetForm = (value: ReactNode) => elements(value).find((element) => element.type === 'form' && elements(element).some((child) => child.props.name === 'confirm'))!;

beforeEach(() => { hooks.active = false; hooks.cursor = 0; hooks.slots = []; hooks.pending = false; vi.clearAllMocks(); actions.reset.mockResolvedValue({ message: 'Sample data restored.' }); actions.clearOwner.mockResolvedValue(undefined); });

describe('private demo sandbox notice', () => {
  it('keeps the protected legacy demo notice and exit without a reset control', () => {
    const markup = renderToStaticMarkup(createElement(DemoNotice));
    expect(markup).toContain('View only'); expect(markup).toContain('Exit demo');
    expect(markup).not.toContain('Reset sample data'); expect(actions.reset).not.toHaveBeenCalled();
  });

  it('explains editable private records and requires a separate confirmation before resetting', () => {
    let view = notice();
    expect(html(view)).toContain('Private demo sandbox'); expect(html(view)).toContain('Your changes stay here');
    expect(html(view)).toContain('Payments and external messages are simulated.');
    expect(html(view)).not.toContain('Reset my sandbox');
    disclosure(view).props.onClick!(); view = notice();
    expect(disclosure(view).props['aria-expanded']).toBe(true);
    expect(html(view)).toContain('Real company records and other visitors');
    expect(elements(resetForm(view)).filter((element) => element.type === 'input').map((element) => [element.props.name, element.props.value])).toEqual([['confirm', 'reset-own-demo']]);
    expect(actions.reset).not.toHaveBeenCalled();
    elements(view).find((element) => element.type === 'button' && element.props.children === 'Keep my changes')!.props.onClick!();
    expect(html(notice())).not.toContain('Reset my sandbox'); expect(actions.reset).not.toHaveBeenCalled();
  });

  it('closes the reset panel only after the server confirms success and announces the result', async () => {
    let view = notice(); disclosure(view).props.onClick!(); view = notice();
    const form = new FormData(); form.set('confirm', 'reset-own-demo');
    await resetForm(view).props.action!(form);
    expect(actions.reset).toHaveBeenCalledExactlyOnceWith({}, form);
    const markup = html(notice());
    expect(markup).toContain('role="status"'); expect(markup).toContain('Sample data restored.'); expect(markup).not.toContain('Reset my sandbox');
  });

  it('keeps reset errors visible and prevents repeated confirmation while a reset is pending', async () => {
    actions.reset.mockResolvedValue({ error: 'This sandbox could not be reset.' });
    let view = notice(); disclosure(view).props.onClick!(); view = notice();
    const form = new FormData(); form.set('confirm', 'reset-own-demo'); await resetForm(view).props.action!(form);
    const failed = html(notice()); expect(failed).toContain('role="alert"'); expect(failed).toContain('This sandbox could not be reset.'); expect(failed).toContain('Reset my sandbox');
    hooks.pending = true; view = notice();
    expect(disclosure(view).props.disabled).toBe(true);
    expect(elements(resetForm(view)).filter((element) => element.type === 'button').every((element) => element.props.disabled)).toBe(true);
    expect(html(view)).toContain('Resetting…');
  });
  it('clears only the verified sandbox device owner after a committed reset and describes cleanup failures truthfully', async () => {
    const owner = JSON.stringify(['private-sandbox', 'current-user']);
    let view = notice(true, owner); disclosure(view).props.onClick!(); view = notice(true, owner);
    const form = new FormData(); form.set('confirm', 'reset-own-demo');
    await resetForm(view).props.action!(form);
    expect(actions.clearOwner).toHaveBeenCalledExactlyOnceWith(owner);
    expect(actions.reset.mock.invocationCallOrder[0]).toBeLessThan(actions.clearOwner.mock.invocationCallOrder[0]);
    actions.clearOwner.mockRejectedValueOnce(new Error('Device storage unavailable'));
    view = notice(true, owner); disclosure(view).props.onClick!(); view = notice(true, owner);
    await resetForm(view).props.action!(form);
    const markup = html(notice(true, owner));
    expect(markup).toContain('Your sandbox was reset, but this device'); expect(markup).toContain('role="alert"'); expect(markup).not.toContain('Reset my sandbox');
    expect(markup).not.toContain('Your sandbox could not be reset');
  });
  it('does not clear device work or claim a reset succeeded when the server response is interrupted', async () => {
    actions.reset.mockRejectedValueOnce(new Error('Connection interrupted'));
    const owner = JSON.stringify(['private-sandbox', 'current-user']);
    let view = notice(true, owner); disclosure(view).props.onClick!(); view = notice(true, owner);
    const form = new FormData(); form.set('confirm', 'reset-own-demo'); await resetForm(view).props.action!(form);
    const markup = html(notice(true, owner));
    expect(markup).toContain('The reset could not be confirmed.'); expect(markup).toContain('role="alert"');
    expect(markup).toContain('Reset my sandbox'); expect(actions.clearOwner).not.toHaveBeenCalled();
  });
});
