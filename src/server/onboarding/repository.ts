import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import {
  EMPTY_OWNER_SETUP,
  ownerSetupDraftSchema,
  recommendOwnerPlan,
  validateOwnerCompletion,
  type OwnerSetupDraft,
} from '@/domain/owner-onboarding';

export type OwnerSetupRecord = {
  draft: OwnerSetupDraft;
  version: number;
  completedAt: string | null;
  updatedAt: string | null;
};

export class OnboardingConflictError extends Error {
  constructor() {
    super('Your setup changed in another tab. Reload the latest saved version before continuing.');
    this.name = 'OnboardingConflictError';
  }
}

type Completion = {
  property: OwnerSetupDraft['firstProperty'];
  planKey: string;
};

type LocalEnvelope = {
  record: OwnerSetupRecord;
  propertySetup: (Completion & { status: 'pending_activation'; createdAt: string }) | null;
  events: { id: string; event: 'owner_onboarding.completed'; metadata: { planKey: string; version: number }; createdAt: string }[];
};

type DatabaseRecord = {
  draft: unknown;
  version: number;
  completed_at: string | Date | null;
  updated_at: string | Date;
};

const localLocks = new Map<string, Promise<void>>();

function assertSubject(subject: string) {
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\u0000-\u001f\u007f]/.test(subject)) {
    throw new Error('A valid authenticated onboarding subject is required.');
  }
}

function assertVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 0 || version >= 2_147_483_647) {
    throw new Error('A valid onboarding version is required.');
  }
}

function connection() {
  if (process.env.DATABASE_URL) return neon(process.env.DATABASE_URL);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required for production owner onboarding.');
  }
  return null;
}

function emptyRecord(): OwnerSetupRecord {
  return { draft: structuredClone(EMPTY_OWNER_SETUP), version: 0, completedAt: null, updatedAt: null };
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Stored onboarding timestamp is invalid.');
  return date.toISOString();
}

function fromDatabase(row: DatabaseRecord): OwnerSetupRecord {
  if (!Number.isSafeInteger(row.version) || row.version < 1) throw new Error('Stored onboarding version is invalid.');
  return {
    draft: ownerSetupDraftSchema.parse(row.draft),
    version: row.version,
    completedAt: iso(row.completed_at),
    updatedAt: iso(row.updated_at),
  };
}

function localPath(subject: string) {
  const directory = path.join(process.cwd(), '.propbrew-local', 'owner-onboarding');
  const digest = createHash('sha256').update(subject).digest('hex');
  return { directory, filename: path.join(directory, `${digest}.json`) };
}

async function readLocal(subject: string): Promise<LocalEnvelope> {
  let raw: string;
  try {
    raw = await readFile(localPath(subject).filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { record: emptyRecord(), propertySetup: null, events: [] };
    }
    throw error;
  }
  const envelope = JSON.parse(raw) as LocalEnvelope;
  if (!envelope.record || !Array.isArray(envelope.events)) throw new Error('Stored onboarding record is invalid.');
  envelope.record = fromDatabase({
    draft: envelope.record.draft,
    version: envelope.record.version,
    completed_at: envelope.record.completedAt,
    updated_at: envelope.record.updatedAt as string,
  });
  return envelope;
}

async function writeLocal(subject: string, envelope: LocalEnvelope) {
  const { directory, filename } = localPath(subject);
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, filename);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

// A single development process serializes local writes. Production never uses
// this adapter: its compare-and-swap and completion are PostgreSQL transactions.
async function withLocalLock<T>(subject: string, work: () => Promise<T>): Promise<T> {
  const key = localPath(subject).filename;
  const previous = localLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  localLocks.set(key, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (localLocks.get(key) === current) localLocks.delete(key);
  }
}

/** Subject must come from the server's authenticated identity, not form data. */
export async function getOwnerSetup(subject: string): Promise<OwnerSetupRecord> {
  assertSubject(subject);
  const query = connection();
  if (!query) return (await readLocal(subject)).record;
  const [, rows] = await query.transaction([
    query`select set_config('app.auth_subject', ${subject}, true)`,
    query`select draft, version, completed_at, updated_at from owner_onboardings where auth_subject = ${subject}`,
  ]);
  return rows.length ? fromDatabase(rows[0] as DatabaseRecord) : emptyRecord();
}

/** Draft saves never reopen or overwrite a completed setup. */
export async function saveOwnerSetup(subject: string, input: OwnerSetupDraft, expectedVersion: number): Promise<OwnerSetupRecord> {
  assertSubject(subject);
  assertVersion(expectedVersion);
  const query = connection();
  const draft = ownerSetupDraftSchema.parse(input);
  if (!query) {
    return withLocalLock(subject, async () => {
      const envelope = await readLocal(subject);
      if (envelope.record.completedAt || envelope.record.version !== expectedVersion) throw new OnboardingConflictError();
      envelope.record = { draft, version: expectedVersion + 1, completedAt: null, updatedAt: new Date().toISOString() };
      await writeLocal(subject, envelope);
      return envelope.record;
    });
  }
  const [, rows] = await query.transaction([
    query`select set_config('app.auth_subject', ${subject}, true)`,
    query`insert into owner_onboardings (auth_subject, draft, version)
      select ${subject}, ${JSON.stringify(draft)}::jsonb, 1
      where ${expectedVersion} = 0 or exists (
        select 1 from owner_onboardings where auth_subject = ${subject} and version = ${expectedVersion} and completed_at is null
      )
      on conflict (auth_subject) do update
        set draft = excluded.draft, version = owner_onboardings.version + 1, updated_at = now()
        where owner_onboardings.auth_subject = ${subject}
          and owner_onboardings.version = ${expectedVersion} and owner_onboardings.completed_at is null
      returning draft, version, completed_at, updated_at`,
  ]);
  if (!rows.length) throw new OnboardingConflictError();
  return fromDatabase(rows[0] as DatabaseRecord);
}

function completion(draft: OwnerSetupDraft): Completion {
  if (Object.keys(validateOwnerCompletion(draft)).length) throw new Error('Complete all owner setup steps before submitting.');
  return { property: structuredClone(draft.firstProperty), planKey: recommendOwnerPlan(draft).key };
}

/** Immutable pending-activation submission, not tenant provisioning or billing. */
export async function completeOwnerSetup(subject: string, input: OwnerSetupDraft, expectedVersion: number): Promise<OwnerSetupRecord> {
  assertSubject(subject);
  const query = connection();
  const existing = await getOwnerSetup(subject);
  if (existing.completedAt) return existing;
  assertVersion(expectedVersion);
  const draft = ownerSetupDraftSchema.parse(input);
  const snapshot = completion(draft);
  if (!query) {
    return withLocalLock(subject, async () => {
      const envelope = await readLocal(subject);
      if (envelope.record.completedAt) return envelope.record;
      if (envelope.record.version !== expectedVersion) throw new OnboardingConflictError();
      const now = new Date().toISOString();
      envelope.record = { draft, version: expectedVersion + 1, completedAt: now, updatedAt: now };
      envelope.propertySetup = { ...snapshot, status: 'pending_activation', createdAt: now };
      envelope.events.push({ id: randomUUID(), event: 'owner_onboarding.completed', metadata: { planKey: snapshot.planKey, version: envelope.record.version }, createdAt: now });
      await writeLocal(subject, envelope);
      return envelope.record;
    });
  }
  const [, rows] = await query.transaction([
    query`select set_config('app.auth_subject', ${subject}, true)`,
    query`with saved as (
      insert into owner_onboardings (auth_subject, draft, version, completed_at)
      select ${subject}, ${JSON.stringify(draft)}::jsonb, 1, now()
      where ${expectedVersion} = 0 or exists (
        select 1 from owner_onboardings where auth_subject = ${subject} and version = ${expectedVersion} and completed_at is null
      )
      on conflict (auth_subject) do update
        set draft = excluded.draft, version = owner_onboardings.version + 1, completed_at = now(), updated_at = now()
        where owner_onboardings.auth_subject = ${subject}
          and owner_onboardings.version = ${expectedVersion} and owner_onboardings.completed_at is null
      returning auth_subject, draft, version, completed_at, updated_at
    ), property_saved as (
      insert into owner_property_setups (auth_subject, property, plan_key, status)
      select auth_subject, ${JSON.stringify(snapshot.property)}::jsonb, ${snapshot.planKey}, 'pending_activation'
      from saved where auth_subject = ${subject}
      returning auth_subject
    ), event_saved as (
      insert into owner_onboarding_events (id, auth_subject, event, metadata)
      select ${randomUUID()}::uuid, saved.auth_subject, 'owner_onboarding.completed',
        jsonb_build_object('planKey', ${snapshot.planKey}::text, 'version', saved.version)
      from saved join property_saved using (auth_subject) where saved.auth_subject = ${subject}
      returning auth_subject
    )
    select saved.draft, saved.version, saved.completed_at, saved.updated_at
    from saved join event_saved using (auth_subject) where saved.auth_subject = ${subject}`,
  ]);
  if (rows.length) return fromDatabase(rows[0] as DatabaseRecord);
  // A concurrent completion may have won after our initial read. Return its
  // immutable result, but never convert an ordinary stale draft into success.
  const persisted = await getOwnerSetup(subject);
  if (persisted.completedAt) return persisted;
  throw new OnboardingConflictError();
}
