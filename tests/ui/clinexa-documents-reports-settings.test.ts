import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsWorkspace } from '@/components/documents/documents-workspace';
import { DocDrawer } from '@/components/documents/doc-drawer';
import { DocSearchBox } from '@/components/documents/search-box';
import { UploadDialog } from '@/components/documents/upload-dialog';
import { MetricsExplorer, reportCurrencyDataset, reportValue } from '@/components/reports/metrics-explorer';
import { AskData } from '@/components/reports/ask-data';
import { EXTRACTION_TEMPLATES } from '@/domain/documents';
import { METRICS, weeklyThroughput, type Dataset } from '@/domain/reports';
import { NOW, NOW_MS } from '@/domain/ppm';
import { CAPABILITIES, CAPABILITY_LABELS, ROLES, ROLE_LABELS, levelFor } from '@/lib/authz';
import { saveDocumentFields, uploadDocument, searchDocuments } from '@/server/actions/documents';
import { askData } from '@/server/actions/ask-data';
import type { DocData, DocView } from '@/components/documents/types';
import type { Invoice, WorkOrder } from '@/domain/entities';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/documents', () => ({ saveDocumentFields: vi.fn(), uploadDocument: vi.fn(), searchDocuments: vi.fn() }));
vi.mock('@/server/actions/ask-data', () => ({ askData: vi.fn() }));

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const documentsSource = () => read('src/components/documents/documents-workspace.tsx');
const drawerSource = () => read('src/components/documents/doc-drawer.tsx');
const uploadSource = () => read('src/components/documents/upload-dialog.tsx');
const searchSource = () => read('src/components/documents/search-box.tsx');
const metricsSource = () => read('src/components/reports/metrics-explorer.tsx');
const askSource = () => read('src/components/reports/ask-data.tsx');
const settingsSource = () => read('src/app/(ops)/(estate)/settings/page.tsx');
const documents: DocView[] = [
  { id: 'doc-manager', tenantId: 'tenant-1', estateId: 'estate-1', name: 'Fire safety certificate.pdf', folder: 'Compliance', type: 'certificate', audience: 'Managers', sizeKb: 512, updatedAt: NOW.slice(0, 10), uploadedBy: 'Estate manager', indexed: true, scanned: true, extractionConfidence: 0.99, keywords: ['fire'], extracted: [{ label: 'Certificate number', value: 'LAG-FIRE-001' }, { label: 'Issuing authority', value: '' }], expiryDate: '2025-01-01', linkedObligationId: 'obligation-fire' },
  { id: 'doc-resident', tenantId: 'tenant-1', estateId: 'estate-1', name: 'Resident handbook.pdf', folder: 'Policies', type: 'handbook', audience: 'All residents', sizeKb: 1024, updatedAt: NOW.slice(0, 10), uploadedBy: 'Estate manager', indexed: false, scanned: false, extractionConfidence: 0.85, keywords: ['handbook'], extracted: [] },
] as unknown as DocView[];
const documentProps: DocData = { now: NOW, canMutate: true, scopeLabel: '1 estate', documents };
const renderDocuments = (props: Partial<DocData> = {}) => renderToStaticMarkup(createElement(DocumentsWorkspace, { ...documentProps, ...props }));
const renderDrawer = (props: Partial<ComponentProps<typeof DocDrawer>> = {}) => renderToStaticMarkup(createElement(DocDrawer, { doc: documents[0], canMutate: true, onClose: vi.fn(), ...props }));
const renderUpload = () => renderToStaticMarkup(createElement(UploadDialog, { onClose: vi.fn() }));
const workOrders = [
  { id: 'wo-ngn', ref: 'WO-001', tenantId: 'tenant-1', siteId: 'estate-1', estateId: 'estate-1', title: 'Water pump', status: 'new', priority: 'high', origin: 'resident_request', cost: { minor: 12_345, currency: 'NGN' }, createdAt: new Date(NOW_MS - 86400000).toISOString(), resolveDueAt: null },
  { id: 'wo-usd', ref: 'WO-002', tenantId: 'tenant-1', siteId: 'estate-1', estateId: 'estate-1', title: 'Lift inspection', status: 'in_progress', priority: 'medium', origin: 'ppm_schedule', cost: { minor: 25_000, currency: 'USD' }, createdAt: new Date(NOW_MS - 8 * 86400000).toISOString(), resolveDueAt: null },
  { id: 'wo-no-cost', ref: 'WO-003', tenantId: 'tenant-1', siteId: 'estate-1', estateId: 'estate-1', title: 'Gate paint', status: 'closed', priority: 'low', origin: 'manager', cost: null, createdAt: new Date(NOW_MS - 15 * 86400000).toISOString(), resolveDueAt: null },
  { id: 'wo-kobo', ref: 'WO-004', tenantId: 'tenant-1', siteId: 'estate-1', estateId: 'estate-1', title: 'Small adjustment', status: 'new', priority: 'low', origin: 'ppm_schedule', cost: { minor: 50, currency: 'NGN' }, createdAt: new Date(NOW_MS - 22 * 86400000).toISOString(), resolveDueAt: null },
] as unknown as WorkOrder[];
const invoices = [
  { id: 'invoice-ngn', tenantId: 'tenant-1', estateId: 'estate-1', status: 'partially_paid', amount: { minor: 1_200_025, currency: 'NGN' }, paid: { minor: 400_025, currency: 'NGN' } },
  { id: 'invoice-usd', tenantId: 'tenant-1', estateId: 'estate-1', status: 'partially_paid', amount: { minor: 500_050, currency: 'USD' }, paid: { minor: 100_050, currency: 'USD' } },
  { id: 'invoice-mismatch', tenantId: 'tenant-1', estateId: 'estate-1', status: 'partially_paid', amount: { minor: 300_000, currency: 'NGN' }, paid: { minor: 100_000, currency: 'USD' } },
] as unknown as Invoice[];
const dataset: Dataset = { workOrders, invoices };
const metric = (id: string) => METRICS.find((candidate) => candidate.id === id)!;
const renderMetrics = (props: Partial<ComponentProps<typeof MetricsExplorer>> = {}) => renderToStaticMarkup(createElement(MetricsExplorer, { dataset, seesInvoices: true, ...props }));

describe('Clinexa-aligned document library and audience preview', () => {
  it('preserves stable library, search and compliance tabs in order and keeps their panels mounted', () => {
    const html = renderDocuments();
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    const source = documentsSource();
    expect(source.indexOf("id: 'library'")).toBeLessThan(source.indexOf("id: 'search'"));
    expect(source.indexOf("id: 'search'")).toBeLessThan(source.indexOf("id: 'compliance'"));
    expect(html).toContain(' hidden=""');
  });
  it('composes the shared design system and uses a semantic searchable document register', () => {
    const source = documentsSource();
    for (const primitive of ['Card', 'CardHeader', 'KpiCard', 'StatusPill', 'Button', 'EmptyState']) expect(source).toMatch(new RegExp(`<${primitive}(?:\\s|>)`));
    const html = renderDocuments();
    for (const value of ['<table', '<thead>', '<tbody>', 'scope="col"', 'pb-data-table', 'pb-table-scroll', 'role="region"', 'tabindex="0"', 'type="search"', 'aria-label="Search document library"', 'Fire safety certificate.pdf', 'Resident handbook.pdf']) expect(html).toContain(value);
    expect(source).not.toContain('pb-hero');
    expect(source).not.toMatch(/<tr[^>]*onClick=/);
  });
  it('applies the resident audience lens consistently to folders, search, counters, details and edit access', () => {
    const source = documentsSource();
    expect(source).toContain("asResident ? data.documents.filter((d) => /resident/i.test(d.audience)) : data.documents");
    expect(source).toContain('new Set(audienceDocuments.map((d) => d.folder))');
    expect(source).toContain('const visible = audienceDocuments.filter');
    expect(source).toContain('audienceDocuments.find((d) => d.id === openId)');
    expect(source).toContain('<DocSearchBox documents={audienceDocuments}');
    expect(source).toContain('const canManage = data.canMutate && !asResident');
    expect(source).toContain('setFolder(\'all\'); setOpenId(null); setUploading(false)');
    expect(source).toContain('...(!asResident ?');
    expect(source).toContain('This preview does not change permissions.');
  });
  it('filters returned search hits against the current audience documents before rendering or opening them', () => {
    const source = searchSource();
    expect(source).toContain('new Map(documents.map((d) => [d.id, d]))');
    expect(source).toContain('result?.hits.filter((h) => byId.has(h.docId)) ?? []');
    expect(source).toContain('const doc = byId.get(h.docId)!');
    expect(source).toContain('onClick={() => onOpen(h.docId)}');
    expect(source).not.toContain('result.hits.map(');
    expect(source).not.toContain('result.hits.slice(');
    expect(source).toContain('matching records in this audience view');
  });
  it('maintains exact read/update route gates and hides record creation for read-only users', () => {
    const html = renderDocuments({ canMutate: false });
    expect(html).not.toContain('>Add document record</button>');
    expect(html).toContain('Read-only');
    const route = read('src/app/(ops)/(estate)/documents/page.tsx');
    expect(route).toContain("requireCapability('announcements', 'read', 'estate')");
    expect(route).toContain("can(actor, 'announcements', 'update').allowed");
    expect(route).toContain('repos.documents.list(actor)');
    expect(documentsSource()).toContain('uploading && canManage && <UploadDialog');
  });
  it('keeps compliance links inside the Estate module and distinguishes records from confirmed compliance', () => {
    const html = renderDocuments();
    expect(html).toContain('href="/estate/inspections"');
    expect(html).toContain('A document record alone does not confirm statutory compliance.');
    const drawer = renderDrawer();
    expect(drawer).toContain('href="/estate/inspections"');
    expect(drawer).toContain('View linked compliance obligation');
    expect(drawer).not.toContain('href="/inspections"');
  });
  it('retains useful empty account states and truthful indexed/file record language', () => {
    const html = renderDocuments({ documents: [], canMutate: false });
    expect(html).toContain('No documents here.');
    expect(html).toContain('No document renewals need attention in this snapshot.');
    expect(html).toContain('0 document records');
    expect(html).toContain('Marked indexed');
    expect(html).not.toMatch(/NaN|Infinity|AI-verified/);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
  });
});

describe('Document record forms, details and search', () => {
  it('uses a native named metadata form with real field labels and no simulated upload success', () => {
    const html = renderUpload();
    for (const value of ['<dialog', 'aria-label="Add document record"', '<form', 'Document name', 'Type', 'Folder', 'Audience', 'Scanned original', 'Metadata only', 'No file bytes are uploaded, OCR is not performed', 'object storage is not connected', 'aria-label="Close document record form"', 'Review fields']) expect(html).toContain(value);
    expect(html).toMatch(/<label[^>]*>[\s\S]*?Document name[\s\S]*?<input[^>]*required=""/);
    expect(html).not.toContain('type="file"');
    expect(html).not.toMatch(/Upload successful|AI extracted|OCR complete/i);
  });
  it('keeps extraction templates blank and clearly identifies manual fields rather than fake OCR values', () => {
    for (const template of Object.values(EXTRACTION_TEMPLATES)) for (const field of template) expect(field.value).toBe('');
    const source = uploadSource();
    expect(source).toContain('EXTRACTION_TEMPLATES[type].map((f) => ({ ...f }))');
    expect(source).toContain('These blank fields are a manual template, not AI-extracted results.');
    expect(source).toContain('Enter a verified value');
    expect(source).not.toContain('extractionConfidence');
  });
  it('protects metadata submission and dismissal while pending and retains errors and entries in the active form', () => {
    const source = uploadSource();
    for (const value of ['canClose={!pending}', 'if (pending) return', 'e.preventDefault()', '<fieldset', 'disabled={pending}', 'role="alert"', 'Your entries are still here; please try again.', 'if (!r.ok) setError(r.error)']) expect(source).toContain(value);
    expect(source).toContain('uploadDocument({ name: name.trim(), folder, type, audience, extracted: fields, scanned })');
    expect(source).toContain('setReviewing(true); return;');
  });
  it('renders a native read-only document drawer with honest disabled downloads and no provider-confidence claim', () => {
    const html = renderDrawer({ canMutate: false });
    for (const value of ['<dialog', 'aria-label="Document: Fire safety certificate.pdf"', 'aria-label="Close document details"', 'Recorded document fields', 'LAG-FIRE-001', 'Not recorded', 'Read-only', 'Download unavailable', 'File download and OCR are not connected', 'not verified by an AI provider']) expect(html).toContain(value);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[\s\S]*?Download unavailable/);
    expect(html).not.toContain('>Edit fields</button>');
    expect(html).not.toContain('99%');
    expect(html).not.toContain('href="#"');
  });
  it('protects edit/save privileges, native form submission and error handling without mutating the source file', () => {
    const source = drawerSource();
    for (const value of ['if (pending || !canMutate) return', 'canClose={!pending}', 'onSubmit={(e) => { e.preventDefault(); save(); }}', 'saveDocumentFields(doc.id, fields)', 'role="alert"', 'Your edits are still here; please try again.', 'canMutate && fields.length > 0', 'Editing fields updates the document record, not the source file.']) expect(source).toContain(value);
    const html = renderDrawer({ doc: documents[1] });
    expect(html).toContain('No structured fields recorded for this document.');
    expect(html).not.toContain('>Edit fields</button>');
  });
  it('labels document search as scoped rules-based preview and guards duplicate searches and network errors', () => {
    const html = renderToStaticMarkup(createElement(DocSearchBox, { documents, onOpen: vi.fn() }));
    expect(html).toContain('Rules-based search over recorded fields and keywords');
    expect(html).toContain('No language model or vector index is connected here.');
    expect(html).toContain('<form');
    expect(html).toContain('aria-label="Search documents"');
    const source = searchSource();
    expect(source).toContain('if (!text || inFlight.current) return');
    expect(source).toContain('finally { inFlight.current = false; }');
    expect(source).toContain('role="alert"');
    expect(source).toContain('Document search is unavailable. Please try again.');
  });
  it('never calls document mutations or search while rendering read-only, manager or empty views', () => {
    renderDocuments(); renderDocuments({ canMutate: false }); renderDrawer(); renderUpload();
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(saveDocumentFields).not.toHaveBeenCalled();
    expect(searchDocuments).not.toHaveBeenCalled();
  });
});

describe('Clinexa-aligned native-currency reports', () => {
  it('preserves the two report sections and existing scoped read gates', () => {
    const route = read('src/app/(ops)/(estate)/reports/page.tsx');
    expect(route.indexOf("id: 'metrics'")).toBeLessThan(route.indexOf("id: 'ask'"));
    expect(route).toContain("requireCapability('reports_analytics', 'read', 'estate')");
    expect(route).toContain("can(actor, 'charges_invoicing', 'read').allowed");
    expect(route).toContain("workOrders: can(actor, 'work_orders', 'read').allowed ? listEstateWorkOrders(actor) : []");
    expect(route).not.toContain('repos.workOrders.list(actor)');
    expect(route).toContain('invoices: seesInvoices ? [...repos.invoices.list(actor).items] : []');
    expect(route).toContain('<PageTabs');
  });
  it('reuses shared cards, metrics, status and controls with labelled currency and dimension choices', () => {
    const source = metricsSource();
    for (const primitive of ['Card', 'CardHeader', 'KpiCard', 'StatusPill', 'Button', 'IconButton', 'EmptyState']) expect(source).toMatch(new RegExp(`<${primitive}(?:\\s|>)`));
    const html = renderMetrics();
    for (const value of ['Choose a reporting metric', 'Report currency', 'aria-label="Breakdown dimension"', 'aria-pressed="true"', 'Save view', 'Export CSV', 'Native currency only, no FX conversion', 'NGN', 'USD']) expect(html).toContain(value);
    expect(source).not.toContain('pb-hero');
  });
  it('preserves kobo and cents in financial values without changing counts and percentages', () => {
    expect(reportValue('money', 12_345, 'NGN')).toBe('₦123.45');
    expect(reportValue('money', 50, 'NGN')).toBe('₦0.5');
    expect(reportValue('money', 0, 'NGN')).toBe('₦0');
    expect(reportValue('money', 25_025, 'USD')).toMatch(/250\.25/);
    expect(reportValue('count', 12_345, 'USD')).toBe('12,345');
    expect(reportValue('percent', 67, 'NGN')).toBe('67%');
    expect(renderMetrics()).toContain('₦123.95');
  });
  it('isolates NGN and USD amounts without dropping work orders or changing count-based metrics', () => {
    const ngn = reportCurrencyDataset(dataset, 'NGN');
    const usd = reportCurrencyDataset(dataset, 'USD');
    expect(ngn.workOrders.map((wo) => wo.id)).toEqual(workOrders.map((wo) => wo.id));
    expect(usd.workOrders.map((wo) => wo.id)).toEqual(workOrders.map((wo) => wo.id));
    expect(ngn.workOrders[1].cost).toBeNull();
    expect(usd.workOrders[0].cost).toBeNull();
    expect(ngn.workOrders[2].cost).toBeNull();
    expect(metric('spend').value(ngn)).toBe(12_395);
    expect(metric('spend').value(usd)).toBe(25_000);
    for (const scoped of [ngn, usd]) {
      expect(metric('open_wo').value(scoped)).toBe(3);
      expect(metric('ppm_share').value(scoped)).toBe(67);
      expect(weeklyThroughput(scoped.workOrders).reduce((sum, value) => sum + value, 0)).toBe(4);
    }
    expect(dataset.workOrders[1].cost?.currency).toBe('USD');
  });
  it('rejects mismatched invoice currencies instead of performing unsupported cross-currency subtraction', () => {
    const ngn = reportCurrencyDataset(dataset, 'NGN');
    const usd = reportCurrencyDataset(dataset, 'USD');
    expect(ngn.invoices.map((invoice) => invoice.id)).toEqual(['invoice-ngn']);
    expect(usd.invoices.map((invoice) => invoice.id)).toEqual(['invoice-usd']);
    expect(metric('outstanding').value(ngn)).toBe(800_000);
    expect(metric('outstanding').value(usd)).toBe(400_000);
    expect(metric('collection_rate').value(ngn)).toBe(33);
    expect(metric('collection_rate').value(usd)).toBe(20);
    expect(dataset.invoices).toHaveLength(3);
  });
  it('formats collection breakdowns as money and preventive-origin breakdowns as counts, not misleading percentages', () => {
    const source = metricsSource();
    expect(source).toContain("metric.id === 'collection_rate' ? 'money' : metric.id === 'ppm_share' ? 'count' : metric.unit");
    expect(source).toContain('Breakdown shows collected payment amounts in');
    expect(source).toContain('not percentages.');
    expect(source).toContain('Breakdown shows work-order counts by origin, not percentage values.');
    expect(source).toContain('reportValue(breakdownUnit, b.value, currency)');
    const ngn = reportCurrencyDataset(dataset, 'NGN');
    expect(metric('collection_rate').breakdown(ngn, 'status').map((bar) => bar.value)).toEqual([400_025]);
    expect(metric('ppm_share').breakdown(ngn, 'origin').reduce((sum, bar) => sum + bar.value, 0)).toBe(4);
  });
  it('shows only real weekly work-order activity and explicitly withholds invented historical series', () => {
    const source = metricsSource();
    expect(source).not.toContain('modelledTrend');
    expect(source).not.toContain('metricTrend(');
    expect(source).toContain('metric.realTrend ? weeklyThroughput');
    expect(source).toContain('No historical series');
    expect(source).toContain('No illustrative trend is presented as measured history.');
    expect(source).toContain('Cost grouped by work-order creation date, not payment date.');
    expect(source).toContain('not a historical count of open work orders.');
    const html = renderMetrics();
    expect(html).toContain('View weekly values');
    expect(html).toContain('role="img"');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('makes session-only saved views and exact CSV units explicit while hiding invoice metrics without billing access', () => {
    const source = metricsSource();
    expect(source).toContain('View saved for this session. It will not persist');
    expect(source).toContain('minor units');
    expect(source).toContain('Monetary values are labelled in minor units; no currency conversion is applied.');
    expect(source).toContain('URL.revokeObjectURL(url)');
    const html = renderMetrics({ seesInvoices: false, dataset: { workOrders, invoices: [] } });
    expect(html).not.toContain('Collection rate');
    expect(html).not.toContain('Outstanding');
    expect(html).toContain('Open work orders');
  });
  it('keeps empty metrics finite and usable without fabricating financial or historical data', () => {
    const empty: Dataset = { workOrders: [], invoices: [] };
    const html = renderMetrics({ dataset: empty });
    expect(html).toContain('No data for this breakdown.');
    expect(html).toContain('₦0');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    expect(reportCurrencyDataset(empty, 'USD')).toEqual(empty);
    for (const entry of METRICS) expect(Number.isFinite(entry.value(empty))).toBe(true);
  });
  it('labels Ask Data as connected AI requiring source review without hidden reasoning or simulated confidence', () => {
    const html = renderToStaticMarkup(createElement(AskData));
    expect(html).toContain('A connected AI provider is required.');
    expect(html).toContain('Ask freely about the supplied records');
    expect(html).toContain('Ask the estate copilot</label>');
    expect(html).toContain('aria-label="Estate copilot conversation"');
    const source = askSource();
    expect(source).toContain('if (!text || busy) return');
    expect(source).toContain("endpoint: '/api/estate/copilot', module: 'estate'");
    expect(read('src/components/ai/use-copilot-stream.ts')).toContain('question.length > COPILOT_MAX_QUESTION || active.current');
    expect(source).toContain('error={Boolean(error)}');
    expect(source).toContain('Rule-match scores are not calibrated AI confidence.');
    expect(source).not.toMatch(/answer\.(?:reasoning|chainOfThought|confidence)|Chain of thought|Thinking process/);
    expect(askData).not.toHaveBeenCalled();
  });
});

describe('Clinexa-aligned Settings policy reference', () => {
  it('requires tenant-config read access and preserves organisation and permission tabs without writable controls', () => {
    const source = settingsSource();
    expect(source).toContain("requireCapability('tenant_config', 'read', 'estate')");
    expect(source.indexOf("id: 'organisation'")).toBeLessThan(source.indexOf("id: 'permissions'"));
    for (const primitive of ['Card', 'CardHeader', 'StatusPill', 'ReadOnlyChip', 'PageTabs']) expect(source).toMatch(new RegExp(`<${primitive}(?:\\s|>)`));
    expect(source).toContain('Organisation editing and preference persistence are not connected in this view.');
    expect(source).not.toMatch(/<form|<input|<select|onClick=|from ['"]@\/server\/actions/);
  });
  it('renders the authoritative capability matrix with semantic row/column headings and accessible level labels', () => {
    const source = settingsSource();
    for (const value of ['CAPABILITIES.map((capability)', 'ROLES.map((role)', 'levelFor(role, capability)', '<th scope="row">', '<th scope="col"', 'Role capability matrix', 'aria-label={`${ROLE_LABELS[role]}: ${LEVEL_LABEL[level]}`}']) expect(source).toContain(value);
    expect(source).toContain("F: 'Full', M: 'Manage', V: 'View', O: 'Own records', none: 'No access'");
    expect(CAPABILITIES.length).toBeGreaterThan(0);
    expect(ROLES.length).toBeGreaterThan(0);
    for (const capability of CAPABILITIES) {
      expect(CAPABILITY_LABELS[capability]).toBeTruthy();
      for (const role of ROLES) {
        expect(ROLE_LABELS[role]).toBeTruthy();
        expect(['F', 'M', 'V', 'O', 'none']).toContain(levelFor(role, capability));
      }
    }
  });
  it('explains read-only permission references, tenant/estate ownership and human-reviewed AI boundaries', () => {
    const source = settingsSource();
    for (const value of ['This reference does not edit access or grant permissions.', 'Role visibility does not replace server-side checks.', '“Own records” is not unrestricted access.', 'The server must check tenant, estate and ownership rules for each request.', 'Human review before consequential actions']) expect(source).toContain(value);
    expect(source).toContain('pb-table-scroll');
    expect(source).toContain('tabIndex={0}');
    expect(source).not.toContain('pb-hero');
  });
});
