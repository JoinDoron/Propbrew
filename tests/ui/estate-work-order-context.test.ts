import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkOrdersBoard, type WoRow } from '@/components/work-orders/work-orders-board';
import { WorkOrdersIntel } from '@/components/work-orders/work-orders-intel';
import type { WorkOrder } from '@/domain/entities';
import { workOrders } from '@/server/data/seed/fixtures';

const order: WorkOrder = { ...workOrders[0], ref: 'WO-CONTEXT', status: 'new', assigneeName: 'Unassigned' };
const row: WoRow = { ...order, breached: false };
const nowMs = Date.parse('2026-07-26T09:00:00Z');

describe('work-order module navigation context', () => {
  it('keeps Estate list record and job links within the Estate module', () => {
    const html = renderToStaticMarkup(createElement(WorkOrdersBoard, { rows: [row], canMutate: false, basePath: '/estate/work-orders' }));
    expect(html.match(/href="\/estate\/work-orders\/WO-CONTEXT"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/work-orders/');
  });

  it('keeps Estate AI-triage, assignment and SLA links within the Estate module', () => {
    const html = renderToStaticMarkup(createElement(WorkOrdersIntel, { wos: [order], nowMs, canMutate: true, basePath: '/estate/work-orders' }));
    expect(html.match(/href="\/estate\/work-orders\/WO-CONTEXT"/g)).toHaveLength(3);
    expect(html).toContain('Open to assign');
    expect(html).toContain('SLA watch');
    expect(html).toContain('advisory, you decide');
    expect(html).not.toContain('href="/work-orders/');
  });

  it('preserves Facility destinations when no context override is supplied', () => {
    const board = renderToStaticMarkup(createElement(WorkOrdersBoard, { rows: [row], canMutate: false }));
    const intel = renderToStaticMarkup(createElement(WorkOrdersIntel, { wos: [order], nowMs, canMutate: true }));
    expect(board.match(/href="\/work-orders\/WO-CONTEXT"/g)).toHaveLength(2);
    expect(intel.match(/href="\/work-orders\/WO-CONTEXT"/g)).toHaveLength(3);
    expect(board + intel).not.toContain('href="/estate/work-orders/');
  });

  it('renders the supplied module-specific create action inside the existing mutation gate', () => {
    const createAction = createElement('button', { type: 'button' }, 'Create Estate work order');
    const html = renderToStaticMarkup(createElement(WorkOrdersBoard, { rows: [row], canMutate: true, basePath: '/estate/work-orders', createAction }));
    expect(html).toContain('Create Estate work order');
    expect(html).not.toContain('>New</button>');
    expect(html).not.toContain('Read-only');
  });

  it('does not expose an injected create action to a read-only actor', () => {
    const createAction = createElement('button', { type: 'button' }, 'Create Estate work order');
    const html = renderToStaticMarkup(createElement(WorkOrdersBoard, { rows: [row], canMutate: false, createAction }));
    expect(html).toContain('Read-only');
    expect(html).not.toContain('Create Estate work order');
    expect(html).not.toContain('>New</button>');
  });

  it('discloses the unavailable Facility creation path when no module create action is supplied', () => {
    const html = renderToStaticMarkup(createElement(WorkOrdersBoard, { rows: [row], canMutate: true, createAction: undefined }));
    expect(html).toContain('New · unavailable');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Facility work-order registration is not connected"/);
    expect(html).toContain('href="/work-orders/WO-CONTEXT"');
  });
});
