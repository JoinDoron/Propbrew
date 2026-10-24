import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(`../../src/components/${file}`, import.meta.url), 'utf8');
const board = read('estate/board-workspace.tsx');
const events = read('estate/events-workspace.tsx');
const collections = read('estate/collections-workspace.tsx');

describe('Clinexa Estate and Facility responsive polish', () => {
  it('keeps collection follow-ups inside the guarded shared-control case drawer', () => {
    expect(collections).toContain('className={styles.caseActions}');
    expect(collections).toContain('canMutate ?');
    expect(collections).toContain('sendReminder(c.id)');
    expect(collections).toContain('setPromiseFor(selected)');
    expect(collections).toContain('advanceDunning(c.id)');
    expect(collections).toContain("reviewFollowUp(selected, 'reminder')");
    expect(collections).toContain('if (!canMutate || pending || !followUp || !confirmationCase) return;');
  });

  it('names the ordered collection workflow and keeps table overflow local and keyboard-scrollable', () => {
    expect(collections).toContain('aria-label={`Collection stages for ${selected.residentName}`}');
    expect(collections).toContain('<ol className={styles.stageList}>');
    expect(collections).toContain("aria-current={s === selected.stage ? 'step' : undefined}");
    expect(collections).toContain('className="pb-table-scroll" role="region" aria-label="Collection case register" tabIndex={0}');
    expect(collections).toContain('{DUNNING_LABEL[s]}');
  });

  it.each([['Board', board], ['Events', events]])('%s uses shared numeric KPI typography', (_name, source) => {
    expect(source).toContain('<KpiCard');
    expect(source).toContain("from '@/components/ui'");
    expect(source).not.toContain('function Kpi(');
    expect(read('ui/primitives.module.css')).toContain('.kpiValue');
  });

  it('uses the smaller value type only for the meeting label and venue name', () => {
    expect(board).toContain('<CardHeader title="Next meeting"');
    expect(board).toContain('{next.title}');
    expect(events).toContain('Busiest venue');
    expect(events).not.toMatch(/<KpiCard label="Busiest venue"/);
  });

  it('uses shared indigo action colours for white hero panels', () => {
    for (const source of [board, events]) {
      expect(source).toContain('<Button variant="primary"');
      expect(source).not.toContain('pb-hero');
      expect(source).not.toMatch(/#183024|#63265e/);
    }
    expect(board).toContain('onClick={() => setShowMotion(true)}');
    expect(events).toContain('onClick={() => setShowCreate(true)}');
  });

  it('gives proxy revocation a named, shared icon target without changing its action', () => {
    expect(board).toContain('aria-label={`Review revocation for ${proxy.grantorName}`}');
    expect(board).toContain("canMutate && proxy.status === 'held'");
    expect(board).toContain('action: () => revokeProxyLink(proxy.id)');
    expect(board).toContain('confirmLabel: \'Confirm revoke proxy\'');
    expect(board).toContain('<CommitteeDecisionDialog');
  });

  it('uses full-sized checklist and evidence targets, preserving completion requirements', () => {
    const ppm = read('ppm/plan-drawer.tsx');
    expect(ppm).toContain('aria-pressed={on}');
    expect(ppm.match(/className=\{styles.evidence\}/g)).toHaveLength(2);
    expect(read('ppm/maintenance-clinexa.module.css')).toContain('.checklist button { height: auto; min-height: 40px;');
    expect(ppm).toContain('<Button key={c.id} aria-pressed={on}');
    expect(ppm).toContain("justifyContent: 'flex-start'");
    expect(ppm).toContain('setPhotos((p) => p + 1)');
    expect(ppm).toContain('disabled={pending || !canComplete}');
    expect(ppm).toContain('photoCount: photos');
  });

  it('keeps visitor-pass and reminder actions permission-gated with shared targets', () => {
    const sos = read('security/sos-console.tsx');
    const billing = read('billing/billing-workspace.tsx');
    expect(sos).toContain('action={canMutate ? <Button onClick={() => setShowPass(true)}');
    expect(sos).toContain('These previews are not valid access credentials.');
    expect(billing).toContain('action={canMutate && highRisk.length > 0 ? <Button');
    expect(billing).toContain('onClick={() => { setToast(null); setCampaign(highRisk); }}>Review reminders</Button>');
    const css = read('ui/application-foundations.css');
    expect(css).toContain('.pb-app .pb-action { display: inline-flex; min-height: 40px;');
    expect(css).toContain('.pb-app :is(.pb-form-control, .pb-action) { min-height: 44px; }');
    expect(css).toContain('.pb-app .pb-icon-action { width: 44px;');
  });
});
