/** Reserved identities for the isolated, public, view-only sample company. */
export const DEMO_TENANT_ID = '6b20d921-50a1-4ccb-9018-d6f80204e223';
export const DEMO_COMPANY_NAME = 'Propbrew Demo Company · Sample data';
export const DEMO_MODULE_GRANTS = Object.freeze({ estate: 'view', facility: 'view', shortlet: 'view', construction: 'view' });
export const DEMO_ACCOUNTS = Object.freeze([
  Object.freeze({ module: 'estate', userId: '8fd60a0b-3fd5-4301-8f01-8c42c2e34d01', email: 'demo-estate@demo.propbrew.invalid', name: 'Estate demo' }),
  Object.freeze({ module: 'facility', userId: '8fd60a0b-3fd5-4301-8f01-8c42c2e34d02', email: 'demo-facility@demo.propbrew.invalid', name: 'Facility demo' }),
  Object.freeze({ module: 'shortlet', userId: '8fd60a0b-3fd5-4301-8f01-8c42c2e34d03', email: 'demo-shortlet@demo.propbrew.invalid', name: 'Shortlet demo' }),
  Object.freeze({ module: 'construction', userId: '8fd60a0b-3fd5-4301-8f01-8c42c2e34d04', email: 'demo-construction@demo.propbrew.invalid', name: 'Construction demo' }),
]);
