'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CloudCheck, LockKeyhole, Sparkles } from 'lucide-react';
import { PropbrewMark } from '@/components/brand/propbrew-logo';
import {
  PORTFOLIO_OPTIONS, PROPERTY_COUNTS, TENANT_COUNTS, RENT_WORKFLOWS, RENT_PAYMENT_METHODS, PRIORITIES, PROPERTY_TYPES,
  STEPS, ownerSetupProgress, ownerSetupResumeStep, validateOwnerStep, recommendOwnerPlan, type OwnerSetupDraft,
} from '@/domain/owner-onboarding';
import { saveOwnerSetupAction, completeOwnerSetupAction } from '@/server/actions/owner-onboarding';
import type { OwnerSetupRecord } from '@/server/onboarding/repository';
import styles from './owner-setup.module.css';

const QUESTIONS = [
  ['What kind of portfolio are you managing?', 'Choose the closest match. This keeps the recommendation focused around the way you actually operate.'],
  ['How many properties do you manage?', 'Count the properties or buildings in your portfolio. We’ll capture the units in your first property shortly.'],
  ['How many tenants do you look after?', 'A rough count is fine. Include the tenants or households you currently manage across your portfolio.'],
  ['How do tenants usually pay rent?', 'Select every method you deal with today. Mixed payment reality matters for records, receipts, and follow-up.'],
  ['What would you most like to simplify?', 'Choose the biggest challenge. We’ll use it to make your recommended starting point more useful.'],
  ['Let’s add your first property.', 'Start with one property. You can prepare the rest of your portfolio later; there’s no need to add tenant details yet.'],
  ['A starting point that fits your portfolio.', 'Based on your answers, here’s our suggested plan fit. This is a recommendation, not a subscription or payment.'],
] as const;

const CHOICE_STEPS = [
  { field: 'portfolioType', options: PORTFOLIO_OPTIONS },
  { field: 'propertyCount', options: PROPERTY_COUNTS },
  { field: 'tenantCount', options: TENANT_COUNTS },
  { field: 'rentWorkflow', options: RENT_WORKFLOWS },
  { field: 'priority', options: PRIORITIES },
] as const;

export function OwnerSetupWizard({ initial, mode, hasWorkspace, homeRoute, companyName, scope }: {
  initial: OwnerSetupRecord;
  mode: 'local' | 'clerk' | 'company';
  hasWorkspace: boolean;
  homeRoute: string;
  companyName?: string;
  scope: string;
}) {
  const [draft, setDraft] = useState<OwnerSetupDraft>(() => ({ ...initial.draft, step: ownerSetupResumeStep(initial.draft) }));
  const [version, setVersion] = useState(initial.version);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState(initial.version ? 'Saved progress restored.' : 'Progress saves as you continue.');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const errorBanner = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const firstRender = useRef(true);
  const router = useRouter();
  const step = draft.step;
  const choice = step < 5 ? CHOICE_STEPS[step] : null;
  const plan = recommendOwnerPlan(draft);
  const missingCurrentAnswer = Boolean(choice && !draft[choice.field]) || (step === 3 && draft.rentPaymentMethods.length === 0);
  const companySetup = mode === 'company';
  const submitLabel = pending
    ? companySetup && step === 6 ? 'Creating your property…' : 'Saving…'
    : step === 6 ? companySetup ? 'Create property & open workspace' : 'Finish setup' : 'Continue';

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus();
  }, [step]);

  useEffect(() => {
    if (error) errorBanner.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function edit(next: OwnerSetupDraft) {
    setDraft(next);
    setDirty(true);
    setMessage('Unsaved changes. Continue or save progress.');
    setError('');
    setErrors({});
  }

  function persist(nextStep: number, complete = false) {
    if (pending || submitting.current) return;
    if (nextStep > step || complete) {
      const invalid = validateOwnerStep(draft, step);
      if (Object.keys(invalid).length) {
        setErrors(invalid);
        setError('Please complete the highlighted details to continue.');
        return;
      }
    }
    const next = { ...draft, step: nextStep };
    submitting.current = true;
    start(async () => {
      try {
        const result = complete
          ? await completeOwnerSetupAction(next, version, scope)
          : await saveOwnerSetupAction(next, version, scope);
        if (!result.ok) {
          setError(result.error);
          setErrors(result.errors ?? {});
          return;
        }
        setDraft(result.record.draft);
        setVersion(result.record.version);
        setDirty(false);
        setErrors({});
        setError('');
        setMessage('Progress saved. You can return to this account later.');
        if (complete || result.record.completedAt) router.replace('/onboarding/complete');
      } catch {
        setError('Connection interrupted. Your answers are still here. Reconnect and try again.');
      } finally {
        submitting.current = false;
      }
    });
  }

  function propertyField(key: keyof OwnerSetupDraft['firstProperty'], value: string | number) {
    edit({ ...draft, firstProperty: { ...draft.firstProperty, [key]: value } });
  }

  function textField(key: 'name' | 'address' | 'city' | 'state', label: string, placeholder: string, maxLength: number, wide = false) {
    const id = `property-${key}`;
    const invalid = errors[`firstProperty.${key}`];
    return (
      <label className={`${styles.field} ${wide ? styles.wide : ''}`} htmlFor={id}>
        {label}
        <input id={id} name={key} className={styles.input} value={draft.firstProperty[key]} maxLength={maxLength}
          placeholder={placeholder} onChange={(event) => propertyField(key, event.target.value)}
          autoComplete={key === 'address' ? 'street-address' : key === 'city' ? 'address-level2' : key === 'state' ? 'address-level1' : 'off'}
          aria-invalid={Boolean(invalid)} aria-describedby={invalid ? `${id}-error` : undefined} required />
        {invalid && <span id={`${id}-error`} className={styles.fieldError}>{invalid}</span>}
      </label>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <aside className={styles.sidebar} aria-label="Portfolio setup progress">
          <Link href="/" className={styles.logo} aria-label="Propbrew home"><PropbrewMark />propbrew</Link>
          <p className={styles.eyebrow}>{companySetup && companyName ? companyName : 'Propbrew setup'}</p>
          <h2>A clearer operating view starts here.</h2>
          <p className={styles.intro}>We’ll learn how your portfolio works, capture the first property, and recommend a plan that fits the way you manage rent, records, and repairs.</p>
          <div className={styles.progressLabel}><span>Setup progress</span><span>{ownerSetupProgress(step)}%</span></div>
          <progress className={styles.progress} value={step + 1} max={7} aria-label={`Setup progress: step ${step + 1} of 7`} />
          <nav aria-label="Setup steps">
            <ol className={styles.steps}>
              {STEPS.map((label, index) => (
                <li key={label}>
                  <button type="button" className={`${styles.step} ${index === step ? styles.currentStep : index < step ? styles.finishedStep : ''}`}
                    aria-current={index === step ? 'step' : undefined} disabled={index >= step || pending} onClick={() => persist(index)}>
                    <span className={styles.stepNumber}>{index < step ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className={styles.sidebarNote}>
            <strong>{companySetup ? 'One property. A working starting point.' : 'Prepare the portfolio. Start when you’re ready.'}</strong>
            <p>{companySetup ? 'Finish setup to create your first property and its vacant units. Add residents and start organising operations from your company workspace.' : 'Capture the shape of your portfolio now. Tenant invitations, rent collection, reminders, documents, and repair workflows come after workspace activation.'}</p>
          </div>
        </aside>

        <section className={styles.content} aria-labelledby="setup-title" aria-busy={pending}>
          <div className={styles.topline}>
            <span className={styles.question}>{step < 5 ? `Question ${step + 1} of 5` : `Step ${step + 1} of 7 · ${STEPS[step]}`}</span>
            <button className={styles.save} type="button" disabled={pending || !dirty} onClick={() => persist(step)}>{pending ? 'Saving…' : 'Save progress'}</button>
          </div>
          <h1 id="setup-title" className={styles.title} ref={heading} tabIndex={-1}>{QUESTIONS[step][0]}</h1>
          <p className={styles.description}>{QUESTIONS[step][1]}</p>
          {mode === 'local' && <p className={styles.notice}>Local preview · setup is saved on this computer for the current demo account. No real account or subscription is created.</p>}
          <form noValidate onSubmit={(event) => { event.preventDefault(); persist(Math.min(step + 1, 6), step === 6); }}>
            {step === 3 && (
              <>
                <p className={styles.selectionHint} id="rent-payment-methods-hint">Select all that apply.</p>
                <fieldset className={styles.choices} disabled={pending}
                  aria-describedby={`rent-payment-methods-hint${errors.rentPaymentMethods ? ' rent-payment-methods-error' : ''}`}>
                  <legend className={styles.srOnly}>How do tenants usually pay rent?</legend>
                  {RENT_PAYMENT_METHODS.map((option) => (
                    <label className={`${styles.choice} ${styles.paymentChoice}`} key={option.key}>
                      <input type="checkbox" name="rentPaymentMethods" value={option.key}
                        checked={draft.rentPaymentMethods.includes(option.key)}
                        onChange={(event) => edit({
                          ...draft,
                          rentPaymentMethods: event.target.checked
                            ? [...draft.rentPaymentMethods, option.key]
                            : draft.rentPaymentMethods.filter((method) => method !== option.key),
                        })}
                        aria-describedby={`rent-payment-${option.key}-description`} />
                      <strong>{option.label}</strong><span id={`rent-payment-${option.key}-description`}>{option.description}</span>
                    </label>
                  ))}
                </fieldset>
                {errors.rentPaymentMethods && <p id="rent-payment-methods-error" className={styles.error}>{errors.rentPaymentMethods}</p>}
                <div className={styles.workflowHeading}>
                  <h2 id="rent-tracking-title">How do you manage rent today?</h2>
                  <p id="rent-tracking-description">Choose the main way you keep track of rent. This is separate from how tenants pay you.</p>
                </div>
              </>
            )}
            {choice && (
              <fieldset className={styles.choices}>
                <legend className={styles.srOnly}>{step === 3 ? 'How do you manage rent today?' : QUESTIONS[step][0]}</legend>
                {choice.options.map((option) => (
                  <label className={styles.choice} key={option.key}>
                    <input type="radio" name={choice.field} value={option.key} checked={draft[choice.field] === option.key}
                      disabled={pending} onChange={() => edit({ ...draft, [choice.field]: option.key })}
                      aria-describedby={`${choice.field}-${option.key}-description`} />
                    <strong>{option.label}</strong><span id={`${choice.field}-${option.key}-description`}>{option.description}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {step === 3 && errors.rentWorkflow && <p className={styles.error}>{errors.rentWorkflow}</p>}

            {step === 5 && (
              <fieldset className={styles.choices} style={{ display: 'block' }} disabled={pending}>
                <legend className={styles.srOnly}>First property details</legend>
                <div className={styles.fields}>
                  {textField('name', 'Property name', 'e.g. Maple Court', 120, true)}
                  <label className={styles.field} htmlFor="property-type">Property type
                    <select id="property-type" className={styles.input} value={draft.firstProperty.propertyType} required
                      onChange={(event) => propertyField('propertyType', event.target.value)} aria-invalid={Boolean(errors['firstProperty.propertyType'])}
                      aria-describedby={errors['firstProperty.propertyType'] ? 'property-type-error' : undefined}>
                      <option value="">Choose a property type</option>
                      {PROPERTY_TYPES.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
                    </select>
                    {errors['firstProperty.propertyType'] && <span id="property-type-error" className={styles.fieldError}>{errors['firstProperty.propertyType']}</span>}
                  </label>
                  <label className={styles.field} htmlFor="property-units">Number of units
                    <input id="property-units" className={styles.input} type="number" min={1} max={10000} step={1} required inputMode="numeric"
                      value={draft.firstProperty.units || ''} onChange={(event) => propertyField('units', event.target.value === '' ? 0 : Number(event.target.value))}
                      aria-invalid={Boolean(errors['firstProperty.units'])} aria-describedby={errors['firstProperty.units'] ? 'property-units-error' : undefined} />
                    {errors['firstProperty.units'] && <span id="property-units-error" className={styles.fieldError}>{errors['firstProperty.units']}</span>}
                  </label>
                  {textField('address', 'Street address', 'Street and area', 240, true)}
                  {textField('city', 'City', 'e.g. Lagos', 80)}
                  {textField('state', 'State / region', 'e.g. Lagos State', 80)}
                  <label className={`${styles.field} ${styles.wide}`} htmlFor="property-country">Country
                    <select id="property-country" className={styles.input} value={draft.firstProperty.country} onChange={(event) => propertyField('country', event.target.value)}>
                      <option value="NG">Nigeria</option><option value="GH">Ghana</option><option value="KE">Kenya</option>
                      <option value="ZA">South Africa</option><option value="RW">Rwanda</option><option value="UG">Uganda</option>
                    </select>
                  </label>
                </div>
              </fieldset>
            )}

            {step === 6 && (
              <div>
                <div className={styles.plan}>
                  <span className={styles.tag}><Sparkles size={12} aria-hidden="true" />Suggested fit</span>
                  <h2>Propbrew {plan.name}</h2><p>{plan.description}</p>
                  <ul className={styles.features}>{plan.features.map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul>
                </div>
                <h3 className={styles.reasonTitle}>Why this fits your answers</h3>
                <ul className={styles.reasons}>{plan.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                <div className={styles.summary}><h3>Your first property</h3><p>{draft.firstProperty.name} · {draft.firstProperty.units} unit{draft.firstProperty.units === 1 ? '' : 's'}</p><p>{draft.firstProperty.city}, {draft.firstProperty.state}</p></div>
                <div className={styles.summary}><h3>Rent payment methods</h3><p>{RENT_PAYMENT_METHODS.filter((option) => draft.rentPaymentMethods.includes(option.key)).map((option) => option.label).join(' · ')}</p></div>
                <p className={styles.notice} style={{ marginTop: 20, marginBottom: 0 }}>{companySetup ? 'Finishing creates this property and its vacant units in your company. Your plan fit is guidance; no subscription, payment or trial starts here.' : 'No payment is taken and no trial starts here. Pricing, workspace access, and paid features are confirmed separately. This recommendation uses your answers, not an AI decision.'}</p>
              </div>
            )}

            {error && <div className={styles.errorBanner} role="alert" ref={errorBanner} tabIndex={-1}>{error}</div>}
            <div className={styles.footer}>
              <button className={styles.back} type="button" disabled={step === 0 || pending} onClick={() => persist(step - 1)}><ArrowLeft size={14} aria-hidden="true" />Back</button>
              <button className={styles.primary} type="submit" disabled={pending || missingCurrentAnswer}>
                {submitLabel}<ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </form>
          <p className={styles.saveStatus} role="status" aria-live="polite"><CloudCheck size={13} aria-hidden="true" />{message}</p>
          <p className={styles.saveStatus}><LockKeyhole size={12} aria-hidden="true" />{companySetup ? 'Your setup stays in this company. No tenant invitations are sent.' : 'Your setup is private to your account. No tenant invitations are sent.'}</p>
          {hasWorkspace && !dirty && <Link className={styles.save} style={{ display: 'inline-block', marginTop: 12 }} href={companySetup ? '/workspaces' : homeRoute}>{companySetup ? 'Set up later' : 'Return to existing workspace'}</Link>}
        </section>
      </div>
    </main>
  );
}
