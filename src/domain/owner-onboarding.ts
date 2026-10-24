import { z } from 'zod';

/** Owner setup describes a portfolio. It never grants roles or starts billing. */
export const PORTFOLIO_OPTIONS = [
  { key: 'individual_landlord', label: 'Individual landlord', description: 'A small rental portfolio you manage yourself.' },
  { key: 'growing_landlord', label: 'Growing landlord', description: 'Multiple properties, units, or resident records.' },
  { key: 'property_manager', label: 'Property manager', description: 'You manage properties for owners or clients.' },
  { key: 'residential_community', label: 'Residential community', description: 'A building, estate, hostel, or resident community.' },
  { key: 'commercial_portfolio', label: 'Commercial portfolio', description: 'Offices, retail spaces, mixed-use, or commercial tenants.' },
] as const;

export const PROPERTY_COUNTS = [
  { key: 'one', label: '1 property', description: 'Start with one property and its units.' },
  { key: 'two_to_five', label: '2–5 properties', description: 'Keep a small portfolio in one place.' },
  { key: 'six_to_twenty', label: '6–20 properties', description: 'Coordinate a growing portfolio.' },
  { key: 'twenty_one_plus', label: '21+ properties', description: 'Plan for a larger operating footprint.' },
] as const;

export const TENANT_COUNTS = [
  { key: 'none', label: 'No tenants yet', description: 'Prepare your records before the first move-in.' },
  { key: 'one_to_ten', label: '1–10 tenants', description: 'A small group of tenant or resident records.' },
  { key: 'eleven_to_fifty', label: '11–50 tenants', description: 'An established rental or resident community.' },
  { key: 'fifty_one_plus', label: '51+ tenants', description: 'A larger community or multi-property portfolio.' },
] as const;

export const RENT_WORKFLOWS = [
  { key: 'manual', label: 'Calls, messages, and paper', description: 'You track rent through conversations, bank alerts, or notebooks.' },
  { key: 'spreadsheets', label: 'Spreadsheets', description: 'You update rent and payment records in a spreadsheet.' },
  { key: 'software', label: 'Another property tool', description: 'You already use software and want a clearer operating view.' },
  { key: 'starting', label: 'I’m just getting started', description: 'You have not set up a rent-management workflow yet.' },
] as const;

export const RENT_PAYMENT_METHODS = [
  { key: 'bank_transfer', label: 'Bank transfer', description: 'Tenants send money to your bank account.' },
  { key: 'cash_manual', label: 'Cash or manual records', description: 'You record cash payments, receipt evidence, and follow-up manually.' },
  { key: 'mobile_money', label: 'Mobile money', description: 'You keep local payment records for mobile-money payments.' },
  { key: 'online_payments', label: 'Online payments', description: 'You want tenants to pay directly through Propbrew.' },
  { key: 'mixed_methods', label: 'Mixed methods', description: 'Different tenants pay in different ways.' },
] as const;

export type RentPaymentMethod = typeof RENT_PAYMENT_METHODS[number]['key'];

export const PRIORITIES = [
  { key: 'rent_collection', label: 'Rent collection', description: 'Track what is due, paid, and outstanding.' },
  { key: 'records', label: 'Scattered records', description: 'Bring property, tenant, and document records together.' },
  { key: 'repairs', label: 'Repairs and maintenance', description: 'Keep requests, evidence, and follow-up organised.' },
  { key: 'communication', label: 'Tenant communication', description: 'Keep updates and conversations easier to follow.' },
  { key: 'portfolio_visibility', label: 'Portfolio visibility', description: 'See what needs attention across your properties.' },
] as const;

export const PROPERTY_TYPES = [
  { key: 'apartment', label: 'Apartment / flat', description: 'An individual flat or apartment.' },
  { key: 'house', label: 'House', description: 'A detached, semi-detached, or terrace home.' },
  { key: 'building', label: 'Residential building', description: 'A block of flats, hostel, or multi-unit building.' },
  { key: 'estate', label: 'Estate / community', description: 'Multiple homes managed as a community.' },
  { key: 'commercial', label: 'Commercial property', description: 'Offices, shops, warehouses, or other business premises.' },
  { key: 'mixed_use', label: 'Mixed-use property', description: 'Residential and commercial spaces in one property.' },
] as const;

export const STEPS = ['Portfolio type', 'Properties', 'Tenants', 'Rent workflow', 'Biggest problem', 'First property', 'Plan fit'] as const;

/** Partial answers can be saved, but payload shape and size remain constrained. */
export const ownerSetupDraftSchema = z.strictObject({
  portfolioType: z.enum(['', ...PORTFOLIO_OPTIONS.map((option) => option.key)]),
  propertyCount: z.enum(['', ...PROPERTY_COUNTS.map((option) => option.key)]),
  tenantCount: z.enum(['', ...TENANT_COUNTS.map((option) => option.key)]),
  rentWorkflow: z.enum(['', ...RENT_WORKFLOWS.map((option) => option.key)]),
  rentPaymentMethods: z.array(z.enum(RENT_PAYMENT_METHODS.map((option) => option.key)))
    .max(RENT_PAYMENT_METHODS.length)
    .refine((methods) => new Set(methods).size === methods.length, { message: 'Choose each rent payment method only once.' })
    .default([]),
  priority: z.enum(['', ...PRIORITIES.map((option) => option.key)]),
  firstProperty: z.strictObject({
    name: z.string().max(120).trim(),
    address: z.string().max(240).trim(),
    city: z.string().max(80).trim(),
    state: z.string().max(80).trim(),
    country: z.string().max(2).trim(),
    propertyType: z.enum(['', ...PROPERTY_TYPES.map((option) => option.key)]),
    units: z.number().int().min(1).max(10_000),
  }),
  step: z.number().int().min(0).max(6),
});

export type OwnerSetupDraft = z.infer<typeof ownerSetupDraftSchema>;

export const EMPTY_OWNER_SETUP: OwnerSetupDraft = {
  portfolioType: '',
  propertyCount: '',
  tenantCount: '',
  rentWorkflow: '',
  rentPaymentMethods: [],
  priority: '',
  firstProperty: { name: '', address: '', city: '', state: '', country: 'NG', propertyType: '', units: 1 },
  step: 0,
};

type SetupErrors = Record<string, string>;

function draftErrors(draft: OwnerSetupDraft): SetupErrors {
  const result = ownerSetupDraftSchema.safeParse(draft);
  if (result.success) return {};
  const errors: SetupErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || '_form';
    errors[field] ??= issue.message;
  }
  return errors;
}

function stepErrors(draft: OwnerSetupDraft, step: number): SetupErrors {
  const errors: SetupErrors = {};
  if (step === 0 && !draft.portfolioType) errors.portfolioType = 'Choose the kind of portfolio you manage.';
  if (step === 1 && !draft.propertyCount) errors.propertyCount = 'Choose how many properties you manage.';
  if (step === 2 && !draft.tenantCount) errors.tenantCount = 'Choose how many tenants you manage.';
  if (step === 3 && !draft.rentWorkflow) errors.rentWorkflow = 'Choose how you currently manage rent.';
  if (step === 3 && !draft.rentPaymentMethods?.length) errors.rentPaymentMethods = 'Choose at least one way tenants pay rent.';
  if (step === 4 && !draft.priority) errors.priority = 'Choose the problem you want to solve first.';
  if (step === 5) {
    const property = draft.firstProperty;
    if (property.name.trim().length < 2) errors['firstProperty.name'] = 'Enter a property name of at least 2 characters.';
    if (property.address.trim().length < 5) errors['firstProperty.address'] = 'Enter an address of at least 5 characters.';
    if (property.city.trim().length < 2) errors['firstProperty.city'] = 'Enter the city or town.';
    if (property.state.trim().length < 2) errors['firstProperty.state'] = 'Enter the state or region.';
    if (!/^[A-Z]{2}$/.test(property.country)) errors['firstProperty.country'] = 'Use a 2-letter uppercase country code, such as NG.';
    if (!property.propertyType) errors['firstProperty.propertyType'] = 'Choose a property type.';
  }
  return errors;
}

/** A step cannot advance until its required answer is present. */
export function validateOwnerStep(draft: OwnerSetupDraft, step: number): SetupErrors {
  if (!Number.isInteger(step) || step < 0 || step >= STEPS.length) return { step: 'Choose a valid setup step.' };
  const malformed = draftErrors(draft);
  if (Object.keys(malformed).length) return malformed;
  return stepErrors(draft, step);
}

/** Completion always revalidates every step; the client step is not authority. */
export function validateOwnerCompletion(draft: OwnerSetupDraft): SetupErrors {
  const malformed = draftErrors(draft);
  if (Object.keys(malformed).length) return malformed;
  const errors: SetupErrors = {};
  for (let step = 0; step < STEPS.length - 1; step += 1) Object.assign(errors, stepErrors(draft, step));
  return errors;
}

export type OwnerPlanRecommendation = {
  key: 'core' | 'growth' | 'scale';
  name: string;
  description: string;
  reasons: string[];
  features: string[];
};

/** Transparent fit guidance, not an entitlement, quotation, trial, or AI decision. */
export function recommendOwnerPlan(draft: OwnerSetupDraft): OwnerPlanRecommendation {
  const scaleReasons: string[] = [];
  if (draft.propertyCount === 'twenty_one_plus') scaleReasons.push('You manage 21 or more properties.');
  if (draft.tenantCount === 'fifty_one_plus') scaleReasons.push('You manage 51 or more tenant records.');
  if (scaleReasons.length) {
    return {
      key: 'scale', name: 'Scale', description: 'A fit to discuss for a larger portfolio and more complex operating needs.',
      reasons: scaleReasons,
      features: ['Portfolio-wide operating visibility', 'Team and approval workflow planning', 'Onboarding and migration planning'],
    };
  }

  const growthReasons: string[] = [];
  if (draft.portfolioType === 'property_manager') growthReasons.push('You manage properties for owners or clients.');
  if (draft.portfolioType === 'residential_community') growthReasons.push('You coordinate a residential community.');
  if (draft.portfolioType === 'commercial_portfolio') growthReasons.push('You manage a commercial portfolio.');
  if (draft.propertyCount === 'six_to_twenty') growthReasons.push('You manage between 6 and 20 properties.');
  if (draft.tenantCount === 'eleven_to_fifty') growthReasons.push('You manage between 11 and 50 tenant records.');
  if (draft.priority === 'rent_collection' && (draft.rentWorkflow === 'manual' || draft.rentWorkflow === 'spreadsheets')) {
    growthReasons.push('Rent collection is your priority and your current workflow needs manual updates.');
  }
  if (growthReasons.length) {
    return {
      key: 'growth', name: 'Growth', description: 'A fit to discuss for coordinating day-to-day work across a growing portfolio.',
      reasons: growthReasons,
      features: ['Rent and resident workflow planning', 'Communication and repair coordination', 'Shared portfolio visibility'],
    };
  }

  return {
    key: 'core', name: 'Core', description: 'A straightforward starting fit for organising a small portfolio.',
    reasons: ['Your answers do not indicate a larger portfolio or complex coordination needs yet.'],
    features: ['Property and unit records', 'Tenant record organisation', 'Repair request tracking'],
  };
}

export function ownerSetupProgress(step: number): number {
  const bounded = Number.isFinite(step) ? Math.min(STEPS.length - 1, Math.max(0, Math.trunc(step))) : 0;
  return Math.round(((bounded + 1) / STEPS.length) * 100);
}

/** Incomplete older drafts revisit the new payment-method question once. */
export function ownerSetupResumeStep(draft: OwnerSetupDraft): number {
  return draft.step > 3 && !draft.rentPaymentMethods?.length ? 3 : draft.step;
}
