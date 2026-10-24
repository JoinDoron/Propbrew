'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { COPILOT_MAX_QUESTION, type CopilotModule } from '@/lib/ai/copilot-protocol';
import { applyCopilotEvent, CopilotClientError, readCopilotStream, serializeCopilotRequest, type CopilotExchange } from '@/lib/ai/copilot-client';

export type { CopilotExchange } from '@/lib/ai/copilot-client';
/** Keep the log contained and follow streaming only while the reader remains near its end. */
export function useCopilotAutoScroll(log: RefObject<HTMLDivElement | null>, exchanges: readonly CopilotExchange[]) {
  const follow = useRef(true);
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const observe = () => { follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; };
    element.addEventListener('scroll', observe, { passive: true });
    return () => element.removeEventListener('scroll', observe);
  }, [log]);
  useEffect(() => {
    const element = log.current;
    if (element && follow.current) element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
  }, [exchanges, log]);
}

export function useCopilotStream({ endpoint, module, onComplete }: { endpoint: string; module: CopilotModule; onComplete?: (exchange: CopilotExchange) => void }) {
  const [exchanges, setExchanges] = useState<CopilotExchange[]>([]);
  const [busy, setBusy] = useState(false);
  const records = useRef<CopilotExchange[]>([]);
  const active = useRef<{ id: string; controller: AbortController } | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.controller.abort(); active.current = null; };
  }, []);
  function update(change: (current: CopilotExchange[]) => CopilotExchange[]) {
    records.current = change(records.current);
    if (mounted.current) setExchanges(records.current);
  }
  async function submit(question: string, retryOf?: string): Promise<boolean> {
    const query = question.trim();
    if (!query || question.length > COPILOT_MAX_QUESTION || active.current) return false;
    const id = `${module}-${++sequence.current}`;
    const controller = new AbortController();
    const body = serializeCopilotRequest(query, records.current);
    active.current = { id, controller };
    setBusy(true);
    update((current) => [...current, { id, question: query, text: '', status: 'submitted', activities: [], startedAt: Date.now(), ...(retryOf ? { retryOf } : {}) }]);
    const patch = (change: (exchange: CopilotExchange) => CopilotExchange) => update((current) => current.map((exchange) => exchange.id === id ? change(exchange) : exchange));
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body, signal: controller.signal });
      await readCopilotStream(response, module, controller.signal, (event) => {
        if (!mounted.current || active.current?.id !== id || controller.signal.aborted) return;
        patch((exchange) => applyCopilotEvent(exchange, event));
      });
      const completed = records.current.find((exchange) => exchange.id === id);
      if (completed?.status === 'complete' && mounted.current && active.current?.id === id) {
        try { onComplete?.(completed); } catch { /* A refresh cannot turn a completed answer into a transport failure. */ }
      }
    } catch (error) {
      if (!controller.signal.aborted && mounted.current && active.current?.id === id) {
        const failure = error instanceof CopilotClientError ? error.failure : { code: 'connection_failed', message: 'The AI connection was interrupted. Any partial answer is incomplete. Your source records have not changed.', retryable: true };
        patch((exchange) => ({ ...exchange, status: 'error', completedAt: Date.now(), error: failure }));
      }
    } finally {
      if (active.current?.id === id) { active.current = null; if (mounted.current) setBusy(false); }
    }
    return true;
  }
  function stop() {
    const current = active.current;
    if (!current) return;
    active.current = null;
    current.controller.abort();
    update((items) => items.map((exchange) => exchange.id === current.id && !['complete', 'error'].includes(exchange.status) ? { ...exchange, status: 'stopped', completedAt: Date.now() } : exchange));
    setBusy(false);
  }
  function retry(id: string) {
    const exchange = records.current.find((item) => item.id === id);
    if (!exchange || active.current || !['stopped', 'error'].includes(exchange.status) || exchange.error?.retryable === false || Date.now() < (exchange.completedAt ?? 0) + (exchange.error?.retryAfterS ?? 0) * 1000) return Promise.resolve(false);
    return submit(exchange.question, exchange.id);
  }
  return { exchanges, busy, submit, stop, retry };
}
