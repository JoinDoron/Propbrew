export type DemoModule = 'estate' | 'facility' | 'shortlet' | 'construction';
export type DemoAccount = Readonly<{ module: DemoModule; userId: string; email: string; name: string }>;
export const DEMO_TENANT_ID: '6b20d921-50a1-4ccb-9018-d6f80204e223';
export const DEMO_COMPANY_NAME: string;
export const DEMO_MODULE_GRANTS: Readonly<Record<DemoModule, 'view'>>;
export const DEMO_ACCOUNTS: readonly DemoAccount[];
