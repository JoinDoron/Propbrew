import { describe, expect, it } from 'vitest';
import {
  EMPTY_OWNER_SETUP, PORTFOLIO_OPTIONS, PROPERTY_COUNTS, PROPERTY_TYPES, PRIORITIES,
  RENT_PAYMENT_METHODS, RENT_WORKFLOWS, STEPS, TENANT_COUNTS, ownerSetupDraftSchema, ownerSetupProgress, ownerSetupResumeStep,
  recommendOwnerPlan, validateOwnerCompletion, validateOwnerStep, type OwnerSetupDraft,
} from '@/domain/owner-onboarding';

function draft(overrides: Partial<OwnerSetupDraft> = {}): OwnerSetupDraft {
  return { ...EMPTY_OWNER_SETUP, firstProperty: { ...EMPTY_OWNER_SETUP.firstProperty }, ...overrides };
}

function complete(overrides: Partial<OwnerSetupDraft> = {}): OwnerSetupDraft {
  return draft({
    portfolioType: 'individual_landlord', propertyCount: 'one', tenantCount: 'none',
    rentWorkflow: 'starting', rentPaymentMethods: ['bank_transfer'], priority: 'records',
    firstProperty: { name: 'Palm Court', address: '14 Example Road', city: 'Lagos', state: 'Lagos', country: 'NG', propertyType: 'building', units: 8 },
    step: 6, ...overrides,
  });
}

describe('owner setup choices and drafts', () => {
  it('offers the five portfolio types and seven ordered steps from the reference flow', () => {
    expect(PORTFOLIO_OPTIONS.map((option) => option.key)).toEqual([
      'individual_landlord', 'growing_landlord', 'property_manager', 'residential_community', 'commercial_portfolio',
    ]);
    expect(STEPS).toEqual(['Portfolio type', 'Properties', 'Tenants', 'Rent workflow', 'Biggest problem', 'First property', 'Plan fit']);
  });

  it('gives every choice a unique key, label, and helpful description', () => {
    for (const options of [PORTFOLIO_OPTIONS, PROPERTY_COUNTS, TENANT_COUNTS, RENT_WORKFLOWS, RENT_PAYMENT_METHODS, PRIORITIES, PROPERTY_TYPES]) {
      expect(new Set(options.map((option) => option.key)).size).toBe(options.length);
      expect(options.every((option) => option.label.length > 0 && option.description.length > 0)).toBe(true);
    }
  });

  it('accepts empty draft answers while defaulting the first property to Nigeria and one unit', () => {
    expect(ownerSetupDraftSchema.safeParse(draft()).success).toBe(true);
    expect(EMPTY_OWNER_SETUP.firstProperty.country).toBe('NG');
    expect(EMPTY_OWNER_SETUP.firstProperty.units).toBe(1);
    expect(EMPTY_OWNER_SETUP.rentPaymentMethods).toEqual([]);
    expect(ownerSetupDraftSchema.safeParse(draft({ firstProperty: { ...EMPTY_OWNER_SETUP.firstProperty, country: '' } })).success).toBe(true);
  });

  it('accepts every published option key', () => {
    for (const [field, options] of [
      ['portfolioType', PORTFOLIO_OPTIONS], ['propertyCount', PROPERTY_COUNTS], ['tenantCount', TENANT_COUNTS],
      ['rentWorkflow', RENT_WORKFLOWS], ['priority', PRIORITIES],
    ] as const) {
      for (const option of options) expect(ownerSetupDraftSchema.safeParse(draft({ [field]: option.key })).success).toBe(true);
    }
    for (const option of PROPERTY_TYPES) {
      expect(ownerSetupDraftSchema.safeParse(draft({ firstProperty: { ...EMPTY_OWNER_SETUP.firstProperty, propertyType: option.key } })).success).toBe(true);
    }
  });

  it.each([null, undefined, [], 'draft', 1, {}, { ...EMPTY_OWNER_SETUP, portfolioType: 'admin' }])('rejects malformed draft input: %j', (input) => {
    expect(ownerSetupDraftSchema.safeParse(input).success).toBe(false);
  });

  it('rejects unknown top-level and nested keys rather than stripping them silently', () => {
    expect(ownerSetupDraftSchema.safeParse({ ...draft(), role: 'admin' }).success).toBe(false);
    expect(ownerSetupDraftSchema.safeParse({ ...draft(), completed: true }).success).toBe(false);
    expect(ownerSetupDraftSchema.safeParse({ ...draft(), firstProperty: { ...EMPTY_OWNER_SETUP.firstProperty, tenantId: 'other-tenant' } }).success).toBe(false);
  });

  it.each([
    ['name', 120], ['address', 240], ['city', 80], ['state', 80], ['country', 2],
  ] as const)('enforces the %s length boundary', (field, maximum) => {
    expect(ownerSetupDraftSchema.safeParse(draft({ firstProperty: { ...EMPTY_OWNER_SETUP.firstProperty, [field]: 'A'.repeat(maximum) } })).success).toBe(true);
    expect(ownerSetupDraftSchema.safeParse(draft({ firstProperty: { ...EMPTY_OWNER_SETUP.firstProperty, [field]: 'A'.repeat(maximum + 1) } })).success).toBe(false);
  });

  it.each([0, -1, 1.5, 10_001, '1', null, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid unit count %j without coercion', (units) => {
    expect(ownerSetupDraftSchema.safeParse({ ...draft(), firstProperty: { ...EMPTY_OWNER_SETUP.firstProperty, units } }).success).toBe(false);
  });

  it('accepts valid unit bounds and trims saved text without changing input', () => {
    const input = complete({ firstProperty: { ...complete().firstProperty, name: ' Palm Court ', units: 10_000 } });
    expect(ownerSetupDraftSchema.parse(input).firstProperty.name).toBe('Palm Court');
    expect(input.firstProperty.name).toBe(' Palm Court ');
    expect(ownerSetupDraftSchema.safeParse(draft()).success).toBe(true);
  });

  it.each([-1, 7, 0.5, '0', null, Number.NaN])('rejects invalid saved step %j', (step) => {
    expect(ownerSetupDraftSchema.safeParse({ ...draft(), step }).success).toBe(false);
  });
});

describe('rent payment methods', () => {
  it('offers all five distinct payment-channel choices', () => {
    expect(RENT_PAYMENT_METHODS.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'bank_transfer', label: 'Bank transfer' },
      { key: 'cash_manual', label: 'Cash or manual records' },
      { key: 'mobile_money', label: 'Mobile money' },
      { key: 'online_payments', label: 'Online payments' },
      { key: 'mixed_methods', label: 'Mixed methods' },
    ]);
  });

  it.each(RENT_PAYMENT_METHODS)('accepts $key as a single selection', ({ key }) => {
    const input = complete({ rentPaymentMethods: [key] });
    expect(ownerSetupDraftSchema.safeParse(input).success).toBe(true);
    expect(validateOwnerStep(input, 3)).toEqual({});
    expect(validateOwnerCompletion(input)).toEqual({});
  });

  it('preserves multiple selected methods without automatically adding Mixed methods', () => {
    const input = complete({ rentPaymentMethods: ['bank_transfer', 'mobile_money', 'cash_manual'] });
    const before = JSON.stringify(input);
    expect(ownerSetupDraftSchema.parse(input).rentPaymentMethods).toEqual(['bank_transfer', 'mobile_money', 'cash_manual']);
    expect(validateOwnerStep(input, 3)).toEqual({});
    expect(JSON.stringify(input)).toBe(before);
  });

  it('accepts Mixed methods alone or alongside specific payment channels', () => {
    expect(validateOwnerStep(complete({ rentPaymentMethods: ['mixed_methods'] }), 3)).toEqual({});
    expect(validateOwnerStep(complete({ rentPaymentMethods: ['mixed_methods', 'bank_transfer', 'online_payments'] }), 3)).toEqual({});
    const allMethods = RENT_PAYMENT_METHODS.map((option) => option.key);
    expect(ownerSetupDraftSchema.parse(complete({ rentPaymentMethods: allMethods })).rentPaymentMethods).toEqual(allMethods);
  });

  it.each([
    ['unknown_method'], ['Bank transfer'], [''], ['bank_transfer', 'bank_transfer'],
    ['bank_transfer', 'cash_manual', 'mobile_money', 'online_payments', 'mixed_methods', 'bank_transfer'],
    'bank_transfer', null, 1, {},
  ].map((rentPaymentMethods) => ({ rentPaymentMethods })))('rejects an invalid payment-method value: $rentPaymentMethods', ({ rentPaymentMethods }) => {
    expect(ownerSetupDraftSchema.safeParse({ ...draft(), rentPaymentMethods }).success).toBe(false);
  });

  it('reports duplicate channels as a field-level payment-method error', () => {
    expect(validateOwnerStep(complete({ rentPaymentMethods: ['bank_transfer', 'bank_transfer'] }), 3))
      .toEqual({ rentPaymentMethods: 'Choose each rent payment method only once.' });
  });

  it('defaults legacy drafts with the field absent to an empty list', () => {
    const legacy = { ...complete() } as Partial<OwnerSetupDraft>;
    delete legacy.rentPaymentMethods;
    const parsed = ownerSetupDraftSchema.parse(legacy);
    expect(parsed.rentPaymentMethods).toEqual([]);
    expect(validateOwnerStep(parsed, 3)).toHaveProperty('rentPaymentMethods');
    expect(validateOwnerCompletion(parsed)).toHaveProperty('rentPaymentMethods');
    expect(ownerSetupResumeStep(parsed)).toBe(3);
  });

  it('requires a payment method as well as the existing tracking-workflow answer', () => {
    expect(validateOwnerStep(complete({ rentPaymentMethods: [] }), 3)).toEqual({ rentPaymentMethods: 'Choose at least one way tenants pay rent.' });
    expect(validateOwnerCompletion(complete({ rentPaymentMethods: [] }))).toHaveProperty('rentPaymentMethods');
    expect(validateOwnerStep(complete({ rentWorkflow: '' }), 3)).toHaveProperty('rentWorkflow');
    expect(validateOwnerStep(complete({ rentWorkflow: '', rentPaymentMethods: [] }), 3)).toHaveProperty('rentPaymentMethods');
  });

  it('does not block valid earlier answers while payment methods remain unanswered', () => {
    const input = complete({ rentPaymentMethods: [] });
    for (const step of [0, 1, 2]) expect(validateOwnerStep(input, step)).toEqual({});
  });

  it('never changes the plan recommendation based on a selected payment channel', () => {
    for (const base of [complete(), complete({ portfolioType: 'property_manager' }), complete({ propertyCount: 'twenty_one_plus' })]) {
      const expected = recommendOwnerPlan(base);
      for (const { key } of RENT_PAYMENT_METHODS) expect(recommendOwnerPlan({ ...base, rentPaymentMethods: [key] })).toEqual(expected);
      expect(recommendOwnerPlan({ ...base, rentPaymentMethods: RENT_PAYMENT_METHODS.map((option) => option.key) })).toEqual(expected);
    }
  });
});

describe('owner setup validation', () => {
  it.each([
    [0, 'portfolioType'], [1, 'propertyCount'], [2, 'tenantCount'], [3, 'rentWorkflow'], [4, 'priority'],
  ] as const)('requires the answer for step %i', (step, field) => {
    expect(validateOwnerStep(draft(), step)).toHaveProperty(field);
    expect(validateOwnerStep(complete(), step)).toEqual({});
  });

  it('does not block an early valid step on unanswered later questions', () => {
    expect(validateOwnerStep(draft({ portfolioType: 'individual_landlord' }), 0)).toEqual({});
  });

  it('validates all required first-property details using dot-separated field paths', () => {
    const errors = validateOwnerStep(draft(), 5);
    expect(Object.keys(errors).sort()).toEqual([
      'firstProperty.address', 'firstProperty.city', 'firstProperty.name', 'firstProperty.propertyType', 'firstProperty.state',
    ]);
    expect(validateOwnerStep(complete(), 5)).toEqual({});
  });

  it('rejects whitespace-only or too-short property fields and non-uppercase country codes', () => {
    const input = complete({ firstProperty: { name: ' A ', address: ' 12 ', city: ' ', state: 'A', country: 'ng', propertyType: 'house', units: 1 } });
    const errors = validateOwnerStep(input, 5);
    for (const field of ['name', 'address', 'city', 'state', 'country']) expect(errors).toHaveProperty(`firstProperty.${field}`);
  });

  it('revalidates every question on completion even if the saved step is the final step', () => {
    const input = draft({ step: 6 });
    const errors = validateOwnerCompletion(input);
    for (const field of ['portfolioType', 'propertyCount', 'tenantCount', 'rentWorkflow', 'rentPaymentMethods', 'priority', 'firstProperty.name']) {
      expect(errors).toHaveProperty(field);
    }
    expect(validateOwnerCompletion(complete())).toEqual({});
  });

  it('reports schema errors before accessing malformed fields', () => {
    const input = { ...complete(), firstProperty: null } as unknown as OwnerSetupDraft;
    expect(validateOwnerCompletion(input)).toHaveProperty('firstProperty');
    expect(validateOwnerStep(input, 5)).toHaveProperty('firstProperty');
  });

  it.each([-1, 7, 1.5, Number.NaN])('rejects an invalid requested step %j', (step) => {
    expect(validateOwnerStep(complete(), step)).toHaveProperty('step');
  });

  it('does not mutate a valid draft during validation', () => {
    const input = complete();
    const before = JSON.stringify(input);
    validateOwnerCompletion(input);
    validateOwnerStep(input, 5);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('transparent owner plan fit', () => {
  it('recommends Core for a small individual owner with no tenants', () => {
    expect(recommendOwnerPlan(complete()).key).toBe('core');
  });

  it.each(['property_manager', 'residential_community', 'commercial_portfolio'] as const)('recommends Growth for %s', (portfolioType) => {
    expect(recommendOwnerPlan(complete({ portfolioType })).key).toBe('growth');
  });

  it('recommends Growth for moderate property or tenant counts', () => {
    expect(recommendOwnerPlan(complete({ propertyCount: 'six_to_twenty' })).key).toBe('growth');
    expect(recommendOwnerPlan(complete({ tenantCount: 'eleven_to_fifty' })).key).toBe('growth');
  });

  it.each(['manual', 'spreadsheets'] as const)('explains Growth when %s rent collection is the priority', (rentWorkflow) => {
    const plan = recommendOwnerPlan(complete({ rentWorkflow, priority: 'rent_collection' }));
    expect(plan.key).toBe('growth');
    expect(plan.reasons.join(' ')).toMatch(/Rent collection/);
    expect(recommendOwnerPlan(complete({ rentWorkflow, priority: 'repairs' })).key).toBe('core');
  });

  it('gives Scale precedence at either large-portfolio threshold', () => {
    expect(recommendOwnerPlan(complete({ propertyCount: 'twenty_one_plus', portfolioType: 'property_manager' })).key).toBe('scale');
    expect(recommendOwnerPlan(complete({ tenantCount: 'fifty_one_plus' })).key).toBe('scale');
  });

  it('is deterministic, explains its reasons, and never changes the draft or issues entitlements', () => {
    const input = complete({ propertyCount: 'twenty_one_plus', tenantCount: 'fifty_one_plus' });
    const before = JSON.stringify(input);
    const plan = recommendOwnerPlan(input);
    expect(plan).toEqual(recommendOwnerPlan(input));
    expect(plan.reasons).toHaveLength(2);
    expect(plan.features.length).toBeGreaterThan(0);
    expect(Object.keys(plan).sort()).toEqual(['description', 'features', 'key', 'name', 'reasons']);
    expect(JSON.stringify(plan)).not.toMatch(/AI|₦|trial|charged|entitlement/i);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('owner setup progress', () => {
  it('starts at 14% and ends at 100% over all seven steps', () => {
    expect(STEPS.map((_, step) => ownerSetupProgress(step))).toEqual([14, 29, 43, 57, 71, 86, 100]);
  });

  it('keeps malformed display inputs within bounds', () => {
    expect(ownerSetupProgress(-1)).toBe(14);
    expect(ownerSetupProgress(99)).toBe(100);
    expect(ownerSetupProgress(Number.NaN)).toBe(14);
  });
});

describe('owner setup resume step', () => {
  it.each([4, 5, 6])('returns an incomplete later draft at step %i to the payment-method question', (step) => {
    const input = complete({ step, rentPaymentMethods: [] });
    expect(ownerSetupResumeStep(input)).toBe(3);
    expect(input.step).toBe(step);
  });

  it.each([0, 1, 2, 3])('does not move an earlier draft forward from step %i', (step) => {
    expect(ownerSetupResumeStep(draft({ step }))).toBe(step);
  });

  it.each([0, 1, 2, 3, 4, 5, 6])('preserves step %i when payment methods have been answered', (step) => {
    expect(ownerSetupResumeStep(complete({ step }))).toBe(step);
  });
});
