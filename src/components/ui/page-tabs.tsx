'use client';

import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { nextPageTab } from '@/lib/page-tabs';
import { PageTabsHeaderContext } from './page-tabs-header';
import styles from './page-tabs.module.css';

export type PageTabItem = {
  /** Stable, unique within this page. Permission-filter the items before passing them. */
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
};

/**
 * Page-local section navigation. Server-rendered content can be passed as slots;
 * this component never imports repositories or grants access to hidden content.
 * Panels stay mounted so switching sections does not discard drafts or filters.
 */
export function PageTabs({ label, items, defaultTab, activeTab, onTabChange, className }: {
  label: string;
  items: readonly PageTabItem[];
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  className?: string;
}) {
  const instance = useId();
  const headerTarget = useContext(PageTabsHeaderContext);
  const [selection, setSelection] = useState(defaultTab ?? items[0]?.id);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const panels = useRef(new Map<string, HTMLDivElement>());
  const root = useRef<HTMLDivElement>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const focusedPanel = useRef<string | null>(null);
  // A permission or data refresh can remove a section; never leave a blank page.
  const requested = activeTab ?? selection;
  const active = items.some((item) => item.id === requested) ? requested : items[0]?.id;
  const ids = items.map((item) => item.id);
  function select(id: string) { setSelection(id); onTabChange?.(id); }

  useEffect(() => {
    const previous = focusedPanel.current;
    // Cross-section actions (e.g. opening a resident profile) must not leave
    // keyboard focus inside a hidden panel. Do not steal focus from a global form.
    if (previous && previous !== active && active &&
      (document.activeElement === document.body || panels.current.get(previous)?.contains(document.activeElement))) {
      buttons.current.get(active)?.focus();
    }
  }, [active]);

  if (!items.length) return null;

  // Only the navigation moves into the shell. Keep panels in their original
  // React tree so forms, filters, permissions and controlled selection survive.
  // A null outlet also keeps server-rendered and standalone pages navigable.
  const navigation = (
    <div ref={tabList}
      className={[styles.tabList, headerTarget ? styles.headerTabList : ''].filter(Boolean).join(' ')}
      data-header-page-tabs={headerTarget ? 'true' : undefined}
      role="tablist" aria-label={label} aria-orientation="horizontal">
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(button) => { if (button) buttons.current.set(item.id, button); else buttons.current.delete(item.id); }}
          type="button"
          role="tab"
          id={`${instance}-tab-${index}`}
          aria-controls={`${instance}-panel-${index}`}
          aria-selected={active === item.id}
          tabIndex={active === item.id ? 0 : -1}
          className={styles.tab}
          onClick={() => select(item.id)}
          onKeyDown={(event) => {
            const next = nextPageTab(ids, item.id, event.key);
            if (next === null || event.altKey || event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            select(next);
            buttons.current.get(next)?.focus();
          }}
        >
          {item.label}
          {item.count !== undefined ? <span className={styles.count}>{item.count}</span> : null}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={root} className={[styles.root, className].filter(Boolean).join(' ')} data-page-tabs="true"
      onFocusCapture={(event) => {
        focusedPanel.current = [...panels.current.entries()].find(([, panel]) => panel.contains(event.target))?.[0] ?? null;
      }}
      onBlurCapture={(event) => {
        // Portal events follow the React tree, but Node.contains follows the
        // DOM tree. Both the local panels and the header navigation are inside
        // this tab group for focus bookkeeping.
        const next = event.relatedTarget as Node | null;
        if (next && !root.current?.contains(next) && !tabList.current?.contains(next)) focusedPanel.current = null;
      }}>
      {headerTarget ? createPortal(navigation, headerTarget) : navigation}
      {items.map((item, index) => (
        <div
          key={item.id}
          ref={(panel) => { if (panel) panels.current.set(item.id, panel); else panels.current.delete(item.id); }}
          id={`${instance}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${instance}-tab-${index}`}
          tabIndex={0}
          hidden={active !== item.id}
          className={styles.panel}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
