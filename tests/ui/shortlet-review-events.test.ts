import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortletReview } from '@/components/shortlet/reference-ui';
import { Button } from '@/components/ui';

// Run the real component and its fieldset listeners in native-before-React event
// order. In particular, a bubbling native click may disable a button before its
// React onClick is dispatched; calling only onClick would miss that regression.
const hooks = vi.hoisted(() => ({ active: false, cursor: 0, slots: [] as unknown[], effects: [] as (() => void | (() => void))[], cleanups: [] as (() => void)[] }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useState(initial: unknown) {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = value; }];
    },
    useRef(initial: unknown) {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useEffect(effect: () => void | (() => void)) {
      if (!hooks.active) return actual.useEffect(effect);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) { hooks.slots[index] = true; hooks.effects.push(effect); }
    },
  };
});

class TestNode {
  parent: TestNode | null;
  constructor(parent: TestNode | null = null) { this.parent = parent; }
  contains(target: TestNode): boolean { return target === this || !!target.parent && this.contains(target.parent); }
  closest(selector: string): TestFieldset | null { return selector === 'fieldset' ? this instanceof TestFieldset ? this : this.parent?.closest(selector) ?? null : null; }
}
class TestFieldset extends TestNode {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(listener); }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { this.listeners.get(type)?.delete(listener); }
  bubble(type: string, target: TestNode) {
    for (const listener of this.listeners.get(type) ?? []) {
      const event = { type, target } as unknown as Event;
      if (typeof listener === 'function') listener(event); else listener.handleEvent(event);
    }
  }
}
type Props = { children?: ReactNode; ref?: { current: TestNode | null }; disabled?: boolean; onChange?: (event: { target: { checked: boolean } }) => void; onClick?: () => void };
const submit = vi.fn(), cancel = vi.fn();
let fieldset: TestFieldset;
let root: ReactNode;
const nodes = new Map<ReactElement, TestNode>();
function render(pending = false) {
  hooks.active = true; hooks.cursor = 0;
  try { root = ShortletReview({ children: 'Recorded booking details', pending, onSubmit: submit, onCancel: cancel, label: 'Confirm booking' }); }
  finally { hooks.active = false; }
  const mount = (value: ReactNode, parent: TestNode) => {
    if (Array.isArray(value)) { value.forEach((child) => mount(child, parent)); return; }
    if (!isValidElement<Props>(value)) return;
    const node = new TestNode(parent); nodes.set(value, node);
    if (value.props.ref) value.props.ref.current = node;
    mount(value.props.children, node);
  };
  mount(root, fieldset);
  for (const effect of hooks.effects.splice(0)) { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); }
}
function find(type: unknown, text?: string): ReactElement<Props> {
  let result: ReactElement<Props> | undefined;
  const visit = (value: ReactNode) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!isValidElement<Props>(value)) return;
    if (value.type === type && (text === undefined || value.props.children === text)) result = value;
    visit(value.props.children);
  };
  visit(root); if (!result) throw new Error('Review control was not rendered.'); return result;
}
function approve() { find('input').props.onChange!({ target: { checked: true } }); render(); expect(find(Button, 'Confirm booking').props.disabled).toBe(false); }
function clickButton(text: string) {
  const button = find(Button, text);
  // Also cover clicks on nested icon/text descendants of an action button.
  fieldset.bubble('click', new TestNode(nodes.get(button)!));
  render();
  const afterNative = find(Button, text);
  if (!afterNative.props.disabled) afterNative.props.onClick!();
}
beforeEach(() => { hooks.active = false; hooks.cursor = 0; hooks.slots = []; hooks.effects = []; hooks.cleanups = []; fieldset = new TestFieldset(); nodes.clear(); submit.mockClear(); cancel.mockClear(); vi.stubGlobal('Node', TestNode); });
afterEach(() => { for (const cleanup of hooks.cleanups) cleanup(); vi.unstubAllGlobals(); });

describe('Shortlet reviewed action event ordering', () => {
  it('preserves checked approval through the native confirm click so React can submit', () => {
    render(); expect(find(Button, 'Confirm booking').props.disabled).toBe(true);
    approve(); clickButton('Confirm booking'); expect(submit).toHaveBeenCalledOnce();
  });
  it.each(['input', 'change', 'click'])('clears approval on an external form control %s before allowing another submission', (event) => {
    render(); approve(); fieldset.bubble(event, new TestNode(fieldset)); render();
    expect(find(Button, 'Confirm booking').props.disabled).toBe(true);
    clickButton('Confirm booking'); expect(submit).not.toHaveBeenCalled();
  });
  it('keeps quick-payment edits invalidating, allows cancellation, and disables pending confirmation', () => {
    render(); approve(); fieldset.bubble('click', new TestNode(fieldset)); render();
    expect(find(Button, 'Confirm booking').props.disabled).toBe(true);
    clickButton('Cancel'); expect(cancel).toHaveBeenCalledOnce();
    approve(); render(true); expect(find(Button, 'Saving…').props.disabled).toBe(true);
  });
});
