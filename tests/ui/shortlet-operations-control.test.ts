import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

describe('Shortlet durable operations', () => {
  it('persists tenant-isolated controls through the existing durable workspace', () => {
    const state = source('src/server/shortlet-control.ts');
    const actions = source('src/server/actions/shortlet-control.ts');
    expect(state).toContain("getRecordAuxiliary<Record<string, ShortletControlState>>('shortlet:control:v1'");
    expect(actions).toContain("withDurableMutation");
    expect(actions).toContain("row.tenantId === access.actor.tenantId");
    expect(actions).toContain('documentLast4');
    expect(actions).not.toContain('documentNumber');
  });

  it('guards channel imports and keeps WhatsApp delivery durable', () => {
    const actions = source('src/server/actions/shortlet-control.ts');
    expect(actions).toContain("url.protocol === 'https:'");
    expect(actions).toContain("redirect: 'error'");
    expect(actions).toContain('AbortSignal.timeout(15_000)');
    expect(actions).toContain('Feed is larger than 1 MB.');
    expect(actions).toContain('.slice(0, 500)');
    expect(actions).toContain('enqueueDelivery');
    expect(actions).toContain('notBeforeISO: message.scheduledForISO');
  });

  it('routes finance and team-role changes through operational approvals', () => {
    const actions = source('src/server/actions/shortlet.ts');
    const controls = source('src/server/actions/shortlet-control.ts');
    expect(actions).toContain("status: 'pending_match'");
    expect(actions).toContain("kind: 'team_role'");
    expect(actions).toContain("payload: { memberId: m.id, role }");
    expect(controls).toContain("request.kind === 'team_role'");
    expect(controls).toContain('member.role = role');
  });

  it('exposes one tabbed operations queue in navigation', () => {
    const page = source('src/app/(ops)/shortlet/operations/page.tsx');
    const workspace = source('src/components/shortlet/operations-control-workspace.tsx');
    const nav = source('src/config/nav.ts');
    expect(page).toContain("requireCapability('bookings_amenities', 'read', 'shortlet')");
    expect(workspace).toContain('Guest readiness');
    expect(workspace).toContain('Payments & refunds');
    expect(workspace).toContain('Turnovers');
    expect(workspace).toContain('Approvals');
    expect(nav).toContain("href: '/shortlet/operations'");
  });
});
