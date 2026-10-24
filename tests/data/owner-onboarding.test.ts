import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EMPTY_OWNER_SETUP, type OwnerSetupDraft } from '@/domain/owner-onboarding';
import { completeOwnerSetup, getOwnerSetup, OnboardingConflictError, saveOwnerSetup } from '@/server/onboarding/repository';

const database = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({
  neon: () => Object.assign(
    (parts: TemplateStringsArray, ...values: unknown[]) => ({ text: parts.join('?'), values }),
    { transaction: database.transaction },
  ),
}));

function completeDraft(): OwnerSetupDraft {
  return {
    ...structuredClone(EMPTY_OWNER_SETUP),
    portfolioType: 'individual_landlord',
    propertyCount: 'one',
    tenantCount: 'one_to_ten',
    rentWorkflow: 'spreadsheets',
    rentPaymentMethods: ['bank_transfer'],
    priority: 'rent_collection',
    firstProperty: {
      name: 'Lekki Gardens Flat 4', address: '14 Admiralty Way', city: 'Lekki', state: 'Lagos', country: 'NG', propertyType: 'apartment', units: 1,
    },
    step: 6,
  };
}

describe('owner onboarding subject-scoped persistence', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'propbrew-owner-onboarding-'));
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', '');
    database.transaction.mockReset();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it('returns a fresh empty draft for each unknown identity', async () => {
    const first = await getOwnerSetup('clerk-owner-a');
    first.draft.firstProperty.name = 'Not shared';
    expect(await getOwnerSetup('clerk-owner-b')).toEqual({ draft: EMPTY_OWNER_SETUP, version: 0, completedAt: null, updatedAt: null });
    expect(await getOwnerSetup('clerk-owner-a')).toEqual({ draft: EMPTY_OWNER_SETUP, version: 0, completedAt: null, updatedAt: null });
  });

  it('persists a resumable draft on disk rather than in memory', async () => {
    const draft = { ...structuredClone(EMPTY_OWNER_SETUP), portfolioType: 'growing_landlord' as const, step: 1 };
    const saved = await saveOwnerSetup('clerk-owner-a', draft, 0);
    expect(saved.version).toBe(1);
    expect(saved.updatedAt).toMatch(/^\d{4}-/);
    vi.resetModules();
    const restarted = await import('@/server/onboarding/repository');
    expect(await restarted.getOwnerSetup('clerk-owner-a')).toEqual(saved);
  });

  it('resumes multiple payment selections and keeps the completed selection immutable', async () => {
    const draft: OwnerSetupDraft = { ...completeDraft(), rentPaymentMethods: ['bank_transfer', 'cash_manual'] };
    const saved = await saveOwnerSetup('clerk-owner-a', draft, 0);
    const resumed = await getOwnerSetup('clerk-owner-a');
    expect(resumed.draft.rentPaymentMethods).toEqual(['bank_transfer', 'cash_manual']);
    expect(resumed).toEqual(saved);
    const completed = await completeOwnerSetup('clerk-owner-a', resumed.draft, resumed.version);
    const changed: OwnerSetupDraft = { ...draft, rentPaymentMethods: ['mobile_money'] };
    expect(await completeOwnerSetup('clerk-owner-a', changed, completed.version)).toEqual(completed);
    await expect(saveOwnerSetup('clerk-owner-a', changed, completed.version)).rejects.toBeInstanceOf(OnboardingConflictError);
    expect((await getOwnerSetup('clerk-owner-a')).draft.rentPaymentMethods).toEqual(['bank_transfer', 'cash_manual']);
    expect((await getOwnerSetup('clerk-owner-b')).draft.rentPaymentMethods).toEqual([]);
    const filename = (await readdir(path.join(directory, '.propbrew-local', 'owner-onboarding')))[0];
    const envelope = JSON.parse(await readFile(path.join(directory, '.propbrew-local', 'owner-onboarding', filename), 'utf8'));
    expect(envelope.record.draft.rentPaymentMethods).toEqual(['bank_transfer', 'cash_manual']);
    expect(envelope.events).toHaveLength(1);
  });

  it('reads a legacy local draft without inventing a payment method and requires an answer to finish', async () => {
    await saveOwnerSetup('clerk-owner-a', completeDraft(), 0);
    const filename = (await readdir(path.join(directory, '.propbrew-local', 'owner-onboarding')))[0];
    const file = path.join(directory, '.propbrew-local', 'owner-onboarding', filename);
    const legacy = JSON.parse(await readFile(file, 'utf8'));
    delete legacy.record.draft.rentPaymentMethods;
    await writeFile(file, JSON.stringify(legacy), 'utf8');
    const resumed = await getOwnerSetup('clerk-owner-a');
    expect(resumed.draft.rentPaymentMethods).toEqual([]);
    expect(resumed.draft.rentWorkflow).toBe('spreadsheets');
    await expect(completeOwnerSetup('clerk-owner-a', resumed.draft, resumed.version)).rejects.toThrow('Complete all owner setup steps');
    expect((await getOwnerSetup('clerk-owner-a')).completedAt).toBeNull();
  });

  it('does not mix identity drafts and hashes filenames even for path-like subjects', async () => {
    await saveOwnerSetup('../../owner@example.com', completeDraft(), 0);
    expect((await getOwnerSetup('clerk-owner-b')).version).toBe(0);
    const files = await readdir(path.join(directory, '.propbrew-local', 'owner-onboarding'));
    expect(files).toEqual([`${createHash('sha256').update('../../owner@example.com').digest('hex')}.json`]);
    expect((await stat(path.join(directory, '.propbrew-local', 'owner-onboarding'))).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(directory, '.propbrew-local', 'owner-onboarding', files[0]))).mode & 0o777).toBe(0o600);
  });

  it('rejects stale compare-and-swap writes without losing the saved draft', async () => {
    const original = await saveOwnerSetup('clerk-owner-a', completeDraft(), 0);
    await expect(saveOwnerSetup('clerk-owner-a', EMPTY_OWNER_SETUP, 0)).rejects.toBeInstanceOf(OnboardingConflictError);
    await expect(saveOwnerSetup('clerk-owner-b', EMPTY_OWNER_SETUP, 2)).rejects.toBeInstanceOf(OnboardingConflictError);
    expect(await getOwnerSetup('clerk-owner-a')).toEqual(original);
  });

  it('allows only one concurrent writer at a saved version', async () => {
    const results = await Promise.allSettled([
      saveOwnerSetup('clerk-owner-a', completeDraft(), 0),
      saveOwnerSetup('clerk-owner-a', EMPTY_OWNER_SETUP, 0),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await getOwnerSetup('clerk-owner-a')).version).toBe(1);
  });

  it('validates all completion fields before saving a property', async () => {
    await expect(completeOwnerSetup('clerk-owner-a', EMPTY_OWNER_SETUP, 0)).rejects.toThrow('Complete all owner setup steps');
    expect((await getOwnerSetup('clerk-owner-a')).version).toBe(0);
  });

  it('atomically persists completion, the pending property, and one redacted audit event', async () => {
    const result = await completeOwnerSetup('clerk-owner-a', completeDraft(), 0);
    expect(result.version).toBe(1);
    expect(result.completedAt).toBe(result.updatedAt);
    const filename = (await readdir(path.join(directory, '.propbrew-local', 'owner-onboarding')))[0];
    const envelope = JSON.parse(await readFile(path.join(directory, '.propbrew-local', 'owner-onboarding', filename), 'utf8'));
    expect(envelope.propertySetup).toMatchObject({ property: completeDraft().firstProperty, planKey: 'growth', status: 'pending_activation' });
    expect(envelope.events).toHaveLength(1);
    expect(envelope.events[0]).toMatchObject({ event: 'owner_onboarding.completed', metadata: { planKey: 'growth', version: 1 } });
    expect(JSON.stringify(envelope.events)).not.toContain('Admiralty');
    expect(JSON.stringify(envelope.events)).not.toContain('Lekki');
    expect(JSON.stringify(envelope)).not.toContain('tenantId');
    expect(JSON.stringify(envelope)).not.toContain('roles');
  });

  it('keeps completed property immutable and repeated submission idempotent', async () => {
    const saved = await saveOwnerSetup('clerk-owner-a', completeDraft(), 0);
    const complete = await completeOwnerSetup('clerk-owner-a', saved.draft, 1);
    const changed = completeDraft();
    changed.firstProperty.name = 'Another property';
    expect(await completeOwnerSetup('clerk-owner-a', changed, 0)).toEqual(complete);
    expect(await completeOwnerSetup('clerk-owner-a', EMPTY_OWNER_SETUP, 0)).toEqual(complete);
    await expect(saveOwnerSetup('clerk-owner-a', changed, complete.version)).rejects.toBeInstanceOf(OnboardingConflictError);
    const filename = (await readdir(path.join(directory, '.propbrew-local', 'owner-onboarding')))[0];
    const envelope = JSON.parse(await readFile(path.join(directory, '.propbrew-local', 'owner-onboarding', filename), 'utf8'));
    expect(envelope.propertySetup.property.name).toBe(completeDraft().firstProperty.name);
    expect(envelope.events).toHaveLength(1);
  });

  it('handles two concurrent completion requests without duplicate events', async () => {
    const results = await Promise.all([
      completeOwnerSetup('clerk-owner-a', completeDraft(), 0),
      completeOwnerSetup('clerk-owner-a', completeDraft(), 0),
    ]);
    expect(results[0]).toEqual(results[1]);
    const filename = (await readdir(path.join(directory, '.propbrew-local', 'owner-onboarding')))[0];
    const envelope = JSON.parse(await readFile(path.join(directory, '.propbrew-local', 'owner-onboarding', filename), 'utf8'));
    expect(envelope.events).toHaveLength(1);
  });

  it('rejects a stale completion but leaves independent subjects untouched', async () => {
    await saveOwnerSetup('clerk-owner-a', completeDraft(), 0);
    await expect(completeOwnerSetup('clerk-owner-a', completeDraft(), 0)).rejects.toBeInstanceOf(OnboardingConflictError);
    await completeOwnerSetup('clerk-owner-b', completeDraft(), 0);
    expect((await getOwnerSetup('clerk-owner-a')).completedAt).toBeNull();
    expect((await getOwnerSetup('clerk-owner-b')).completedAt).not.toBeNull();
  });

  it.each(['', ' ', 'x'.repeat(201), 'invalid\nsubject'])('rejects invalid authenticated subject %j', async (subject) => {
    await expect(getOwnerSetup(subject)).rejects.toThrow('authenticated onboarding subject');
    await expect(saveOwnerSetup(subject, EMPTY_OWNER_SETUP, 0)).rejects.toThrow('authenticated onboarding subject');
    await expect(completeOwnerSetup(subject, completeDraft(), 0)).rejects.toThrow('authenticated onboarding subject');
  });

  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER])('rejects invalid version %s', async (version) => {
    await expect(saveOwnerSetup('clerk-owner-a', EMPTY_OWNER_SETUP, version)).rejects.toThrow('valid onboarding version');
  });

  it('fails closed without a production database and never falls back after a DB failure', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(getOwnerSetup('clerk-owner-a')).rejects.toThrow('DATABASE_URL');
    await expect(saveOwnerSetup('clerk-owner-a', EMPTY_OWNER_SETUP, 0)).rejects.toThrow('DATABASE_URL');
    await expect(completeOwnerSetup('clerk-owner-a', completeDraft(), 0)).rejects.toThrow('DATABASE_URL');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', 'postgres://unused-in-mocked-adapter');
    database.transaction.mockRejectedValue(new Error('Database unavailable'));
    await expect(getOwnerSetup('clerk-owner-a')).rejects.toThrow('Database unavailable');
    await expect(readdir(path.join(directory, '.propbrew-local'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('sets auth subject and reads inside the same database transaction', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://unused-in-mocked-adapter');
    database.transaction.mockResolvedValue([[], []]);
    expect((await getOwnerSetup('clerk-owner-a')).version).toBe(0);
    expect(database.transaction).toHaveBeenCalledOnce();
    const statements = database.transaction.mock.calls[0][0];
    expect(statements[0]).toEqual({ text: "select set_config('app.auth_subject', ?, true)", values: ['clerk-owner-a'] });
    expect(statements[1].text).toContain('where auth_subject = ?');
    expect(statements[1].values).toEqual(['clerk-owner-a']);
  });

  it('parses legacy persisted database drafts with empty payment selections rather than guessing from workflow', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://unused-in-mocked-adapter');
    const legacy: Record<string, unknown> = { ...completeDraft() };
    delete legacy.rentPaymentMethods;
    database.transaction.mockResolvedValue([[], [{
      draft: legacy, version: 2, completed_at: null, updated_at: '2026-10-23T12:00:00Z',
    }]]);
    const record = await getOwnerSetup('clerk-owner-a');
    expect(record.draft.rentPaymentMethods).toEqual([]);
    expect(record.draft.rentWorkflow).toBe('spreadsheets');
    expect(record.version).toBe(2);
    expect(record.completedAt).toBeNull();
  });

  it('uses version/completion checks for database compare-and-swap writes', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://unused-in-mocked-adapter');
    database.transaction.mockResolvedValue([[], []]);
    await expect(saveOwnerSetup('clerk-owner-a', completeDraft(), 4)).rejects.toBeInstanceOf(OnboardingConflictError);
    const statements = database.transaction.mock.calls[0][0];
    expect(statements[0].values).toEqual(['clerk-owner-a']);
    expect(statements[1].text).toContain('on conflict (auth_subject) do update');
    expect(statements[1].text).toContain('owner_onboardings.version = ? and owner_onboardings.completed_at is null');
    expect(statements[1].values).toContain(4);
    expect(statements[1].values).not.toContain('clerk-owner-b');
  });

  it('keeps database property and redacted event inserts in the completion transaction', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://unused-in-mocked-adapter');
    database.transaction.mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[], [{
      draft: completeDraft(), version: 1, completed_at: '2026-10-23T12:00:00Z', updated_at: '2026-10-23T12:00:00Z',
    }]]);
    expect((await completeOwnerSetup('clerk-owner-a', completeDraft(), 0)).completedAt).toBe('2026-10-23T12:00:00.000Z');
    expect(database.transaction).toHaveBeenCalledTimes(2);
    const statements = database.transaction.mock.calls[1][0];
    expect(statements[0].values).toEqual(['clerk-owner-a']);
    expect(statements[1].text).toContain('with saved as');
    expect(statements[1].text).toContain('insert into owner_property_setups');
    expect(statements[1].text).toContain("'pending_activation'");
    expect(statements[1].text).toContain('insert into owner_onboarding_events');
    expect(statements[1].text).toContain("jsonb_build_object('planKey', ?::text, 'version', saved.version)");
    expect(statements[1].text).not.toContain('tenant_id');
  });

  it('returns the persisted database completion when another request wins the race', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://unused-in-mocked-adapter');
    const winner = completeDraft();
    winner.firstProperty.name = 'Winning immutable property';
    database.transaction.mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[], [{
      draft: winner, version: 3, completed_at: '2026-10-23T12:00:00Z', updated_at: '2026-10-23T12:00:00Z',
    }]]);
    const result = await completeOwnerSetup('clerk-owner-a', completeDraft(), 2);
    expect(result.draft.firstProperty.name).toBe('Winning immutable property');
    expect(result.version).toBe(3);
    expect(database.transaction).toHaveBeenCalledTimes(3);
  });

  it('reports a database completion conflict when the winner only saved a newer draft', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://unused-in-mocked-adapter');
    database.transaction.mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[], [{
      draft: completeDraft(), version: 3, completed_at: null, updated_at: '2026-10-23T12:00:00Z',
    }]]);
    await expect(completeOwnerSetup('clerk-owner-a', completeDraft(), 2)).rejects.toBeInstanceOf(OnboardingConflictError);
  });
});
