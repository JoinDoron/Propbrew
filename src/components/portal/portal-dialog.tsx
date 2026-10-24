'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** The same quiet panel system, with native modal focus and dismissal behaviour. */
export function PortalDialog({ children, label, onClose, width = 460, drawer = false, canClose = true, dismissOnBackdrop = true }: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  width?: number;
  drawer?: boolean;
  canClose?: boolean;
  dismissOnBackdrop?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} aria-label={label} aria-modal="true" data-portal-dialog="true"
      className={drawer
        ? 'fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-[calc(100vw-16px)] overflow-y-auto border-0 bg-transparent p-0 text-text backdrop:bg-black/45'
        : 'm-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] overflow-y-auto border-0 bg-transparent p-0 text-text backdrop:bg-black/45'}
      style={{ maxWidth: width }}
      onCancel={(event) => { event.preventDefault(); if (canClose) onClose(); }}
      onClick={(event) => { if (dismissOnBackdrop && canClose && event.target === event.currentTarget) onClose(); }}>
      {children}
    </dialog>
  );
}
