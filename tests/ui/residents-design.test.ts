import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ResidentsExplorer, type ResidentRow } from '@/components/people/residents-explorer';

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const source = read('src/components/people/residents-explorer.tsx');
const css = read('src/components/people/residents-explorer.module.css');
const resident: ResidentRow = {
  id: 'resident-a', userId: 'user-a', name: 'Chiamaka Ọkafor', email: 'chiamaka@example.test',
  unitId: 'unit-a', unitLabel: 'Block A · 012', unitType: 'Apartment', status: 'active',
  household: 4, balanceLabel: '₦125,000', balanceOwed: true, moveInDate: '2026-01-01',
};
const props = {
  residents: [resident], canMutate: true, seesBills: true, seesRequests: true, seesBookings: true,
  bills: [{ id: 'bill-a', ref: 'BILL-0042', ownerUserId: 'user-a', unitId: 'unit-a', status: 'overdue', amountLabel: '₦125,000', dueDate: '2026-07-01' }],
  requests: [{ id: 'request-a', ref: 'WO-0042', requesterUserId: 'user-a', unitId: 'unit-a', title: 'Leaking kitchen tap', status: 'in_progress' }],
  bookings: [{ id: 'booking-a', ownerUserId: 'user-a', amenity: 'Residents lounge', status: 'confirmed', slot: '2026-07-27T10:00:00Z' }],
};
const render = (overrides: Partial<typeof props> = {}) => renderToStaticMarkup(createElement(ResidentsExplorer, { ...props, ...overrides }));

describe('Clinexa-aligned resident workspace', () => {
  it('renders a real directory table with resident, unit, household, status and permitted balance columns', () => {
    const html = render();
    const directory = html.match(/<section[^>]*aria-label="Resident directory"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(directory).toContain('<table');
    expect(directory).toContain('<caption');
    for (const heading of ['Resident', 'Unit', 'Household', 'Status', 'Balance']) expect(directory).toMatch(new RegExp('scope="col"[^>]*>' + heading + '</th>'));
    expect(directory).toContain('Chiamaka Ọkafor');
    expect(directory).toContain('chiamaka@example.test');
    expect(directory).toContain('Block A · 012');
    expect(directory).toContain('4 people');
    expect(directory).toContain('₦125,000');
    expect(directory).toContain('Showing 1 of 1 residents');
  });

  it('uses real profile buttons rather than a clickable row or dead Invite action', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="View profile for Chiamaka Ọkafor"/);
    expect(source).toContain("setSelectedId(resident.id); setSection('profile');");
    expect(source).not.toContain('>Invite</Button>');
    expect(html).not.toMatch(/<tr[^>]*(?:role="button"|tabindex)/);
  });

  it('preserves the controlled page tabs, filter and selection states without remount keys', () => {
    expect(source).toContain("useState('directory')");
    expect(source).toContain("useState('all')");
    expect(source).toContain("useState('')");
    expect(source).toContain('activeTab={section} onTabChange={setSection}');
    for (const id of ['directory', 'profile', 'bills', 'requests', 'bookings', 'communication']) expect(source).toContain("id: '" + id + "'");
    expect(source).not.toContain('<PageTabs key=');
    expect(source).toContain('resident.name.toLowerCase().includes(query)');
    expect(source).toContain("(resident.email ?? '').toLowerCase().includes(query)");
    expect(source).toContain('resident.unitLabel.toLowerCase().includes(query)');
  });

  it('keeps the directory toolbar labelled and displays actual status counts', () => {
    const html = render();
    expect(html).toContain('aria-label="Search residents"');
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Filter residents by status"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('All residents');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).not.toContain('>Read-only');
    expect(render({ canMutate: false })).toContain('Read-only');
  });

  it('does not expose financial balances or financial advisory flags without bill permission', () => {
    const html = render({ seesBills: false });
    expect(html).not.toContain('₦125,000');
    expect(html).not.toContain('BILL-0042');
    expect(html).not.toContain('>Balance<');
    expect(html).not.toContain('payment reliability');
    expect(html).not.toContain('Poor payment history');
    expect(html).not.toContain('Outstanding balance');
    expect(source).toContain('balanceOwed: seesBills && sel.balanceOwed');
  });

  it('does not expose related records or destination links without their capabilities', () => {
    const html = render({ seesBills: false, seesRequests: false, seesBookings: false });
    for (const secret of ['BILL-0042', 'WO-0042', 'Leaking kitchen tap', 'Residents lounge', 'href="/billing"', 'href="/estate/work-orders"', 'href="/bookings"']) expect(html).not.toContain(secret);
    expect(html.match(/role="tab"/g)).toHaveLength(3);
  });

  it('presents factual household counts without inventing named relationships', () => {
    const html = render();
    expect(html).toContain('4<span');
    expect(html).toContain('people recorded');
    expect(html).toContain('3 additional members. Names and relationships have not been recorded in this view.');
    expect(html).not.toMatch(/Spouse|Relative|>Child</);
    expect(html).not.toContain('href="#"');
  });

  it('shows an honest communication empty state instead of fabricated delivered messages', () => {
    const html = render();
    expect(html).toContain('No communication history available');
    expect(html).toContain('No delivery records have been supplied to this view.');
    expect(html).not.toMatch(/Estate announcement delivered|Payment reminder sent|Booking confirmation sent|Portal invitation emailed|Jul 24|Jul 22/);
  });

  it('retains advisory engagement with an accessible meter, source scope and explicit snapshot date', () => {
    const html = render();
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-label="Resident engagement score"');
    expect(html).toContain('aria-valuemin="0" aria-valuemax="100"');
    expect(html).toContain('advisory only');
    expect(html).toContain('records visible to your role');
    expect(html).toContain('26 Jul 2026');
    expect(html).toContain('Not an AI or credit decision.');
  });

  it('uses readable linked record tables while preserving maintenance destinations', () => {
    const html = render();
    expect(html.match(/<table\b/g)).toHaveLength(4);
    expect(html).toContain('href="/estate/work-orders"');
    expect(html).toContain('href="/estate/work-orders/WO-0042"');
    expect(html).not.toContain('href="/work-orders');
    expect(html).toContain('aria-label="View maintenance request WO-0042"');
    expect(html).toContain('href="/billing"');
    expect(html).toContain('href="/bookings"');
    expect(html).toContain('27 Jul 2026');
    expect(source).toContain("timeZone: 'Africa/Lagos'");
  });

  it('handles an empty register without fabricated residents or related records', () => {
    const html = render({ residents: [] });
    expect(html.match(/role="tab"/g)).toHaveLength(1);
    expect(html).toContain('No residents match.');
    expect(html).toContain('Residents will appear here when they are added');
    expect(html).toContain('Showing 0 of 0 residents');
    expect(html).not.toContain('BILL-0042');
  });

  it('uses the inspected dimensions and shared theme tokens, not tiny dashboard pills', () => {
    expect(css).toContain('gap: 24px');
    expect(css).toContain('var(--radius-card, 12px)');
    expect(css).toContain('var(--radius-control, 10px)');
    expect(css).toMatch(/\.table th \{[^}]*height: 40px[^}]*font-size: 12px[^}]*font-weight: 500/);
    expect(css).toMatch(/\.table td \{[^}]*padding: 16px[^}]*font-size: 14px/);
    expect(css).not.toMatch(/#[a-f\d]{3,8}\b/i);
    expect(source).not.toMatch(/text-\[1[01](?:\.\d+)?px\]/);
  });

  it('contains table overflow, preserves phone touch targets and respects reduced motion', () => {
    expect(css).toMatch(/\.tableScroll \{[^}]*position: relative/);
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('overscroll-behavior-x: contain');
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('outline: 2px solid var(--primary)');
    expect(source).toContain('tabIndex={0} role="region"');
  });
});
