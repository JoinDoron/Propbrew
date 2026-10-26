import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_OWNER_SETUP, type OwnerSetupDraft } from '@/domain/owner-onboarding';
import { OwnerSetupWizard } from '@/components/onboarding/owner-setup-wizard';
import OwnerSetupCompletePage from '@/app/onboarding/complete/page';

const mocks = vi.hoisted(() => ({
  identity: vi.fn(), record: vi.fn(), save: vi.fn(), complete: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/server/actions/owner-onboarding', () => ({ saveOwnerSetupAction: mocks.save, completeOwnerSetupAction: mocks.complete }));
vi.mock('@/server/onboarding/identity', () => ({ getOwnerIdentity: mocks.identity }));
vi.mock('@/server/onboarding/repository', () => ({ getOwnerSetup: mocks.record }));

const draft: OwnerSetupDraft = {
  ...EMPTY_OWNER_SETUP, portfolioType: 'individual_landlord', propertyCount: 'one', tenantCount: 'none',
  rentWorkflow: 'manual', rentPaymentMethods: ['bank_transfer', 'cash_manual'], priority: 'records', step: 6,
  firstProperty: { name: 'Palm Court', address: '14 Synthetic Road', city: 'Lagos', state: 'Lagos State', country: 'NG', propertyType: 'building', units: 3 },
};
const initial = () => ({ draft: structuredClone(draft), version: 6, completedAt: null, updatedAt: '2026-10-26T12:00:00.000Z' });
const identity = () => ({ mode: 'company', subject: 'company:123', hasWorkspace: true, onboardingRequired: true, homeRoute: '/estate', companyName: 'Palm Properties' });

beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue(identity()); mocks.record.mockResolvedValue({ ...initial(), completedAt: '2026-10-26T12:01:00.000Z', activatedProperty: { id: 'estate-123', name: 'Palm Court', unitCount: 3 } }); });

describe('native owner setup presentation', () => {
  it('labels company completion as operational creation while keeping the plan advisory', () => {
    const html = renderToStaticMarkup(createElement(OwnerSetupWizard, { initial: initial(), mode: 'company', companyName: 'Palm Properties', scope: 'company:123', hasWorkspace: true, homeRoute: '/estate' }));
    expect(html).toContain('Create property &amp; open workspace');
    expect(html).toContain('Palm Properties');
    expect(html).toContain('Finishing creates this property and its vacant units in your company.');
    expect(html).toContain('no subscription, payment or trial starts here');
    expect(html).toContain('Your setup stays in this company.');
    expect(html).toContain('href="/workspaces"'); expect(html).toContain('Set up later');
    expect(html).not.toContain('Local preview');
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('retains the existing preparation-only workflow for legacy local and Clerk setup', () => {
    for (const mode of ['local', 'clerk'] as const) {
      const html = renderToStaticMarkup(createElement(OwnerSetupWizard, { initial: initial(), mode, scope: 'legacy-subject', hasWorkspace: true, homeRoute: '/workspaces' }));
      expect(html).toContain('Finish setup');
      expect(html).not.toContain('Create property &amp; open workspace');
      expect(html).toContain('Pricing, workspace access, and paid features are confirmed separately.');
      expect(html).toContain('Return to existing workspace');
    }
  });

  it('provides real company completion and next actions based on committed property inventory', async () => {
    const html = renderToStaticMarkup(await OwnerSetupCompletePage());
    expect(html).toContain('Your first property is ready.');
    expect(html).toContain('Palm Properties is ready to get started.');
    expect(html).toContain('Property created'); expect(html).toContain('3 units ready for residents');
    for (const path of ['/estate', '/people', '/properties', '/workspaces']) expect(html).toContain(`href="${path}"`);
    expect(html).toContain('Bank transfer · Cash or manual records');
    expect(html).not.toContain('Activation pending');
    expect(html).toContain('does not start a subscription, payment or trial');
    expect(mocks.record).toHaveBeenCalledWith('company:123');
  });

  it('does not present a completed native draft without committed property metadata as activated', async () => {
    mocks.record.mockResolvedValue({ ...initial(), completedAt: '2026-10-26T12:01:00.000Z' });
    await expect(OwnerSetupCompletePage()).rejects.toThrow('missing its activated property');
  });

  it('keeps legacy completion honest about pending activation', async () => {
    mocks.identity.mockResolvedValue({ ...identity(), mode: 'clerk' });
    mocks.record.mockResolvedValue({ ...initial(), completedAt: '2026-10-26T12:01:00.000Z' });
    const html = renderToStaticMarkup(await OwnerSetupCompletePage());
    expect(html).toContain('Your portfolio setup is saved.');
    expect(html).toContain('Activation pending');
    expect(html).not.toContain('Property created');
  });

  it('redirects unfinished or unauthenticated setup before rendering completion', async () => {
    mocks.record.mockResolvedValue(initial());
    await expect(OwnerSetupCompletePage()).rejects.toThrow('redirect:/onboarding');
    mocks.identity.mockResolvedValue(null);
    await expect(OwnerSetupCompletePage()).rejects.toThrow('redirect:/login');
  });
});
