'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Headless header popover: a trigger + a panel that closes on outside-click or
 *  Escape. `trigger` and `children` are render props receiving open/close. */
export function Popover({
  width = 340,
  align = 'right',
  trigger,
  children,
}: {
  width?: number;
  align?: 'left' | 'right';
  trigger: (o: { open: boolean; toggle: () => void; close: () => void }) => ReactNode;
  children: (o: { close: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o), close })}
      {open && (
        <div
          style={{ width: `min(${width}px, calc(100vw - 24px))` }}
          className={`absolute top-[calc(100%+8px)] ${align === 'right' ? 'right-0' : 'left-0'} z-[70] bg-surface border border-border rounded-2xl shadow-float overflow-hidden animate-fade`}
        >
          {children({ close })}
        </div>
      )}
    </div>
  );
}
