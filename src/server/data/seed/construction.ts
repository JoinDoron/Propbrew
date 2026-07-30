/**
 * Construction (ConstructionOS) seed. The delivery side of the off-plan projects
 * investors already track: Marina Heights (cp-marina → p-marina, superstructure,
 * behind schedule + slight cost pressure), Cedar Court (cp-cedar → p-cedar,
 * finishing, handover Dec 2026) and Orchard Residences (cp-orchard, early).
 *
 * Deliberately planted demo scenarios: a schedule slip + critical path on Marina,
 * a cost-code overrun, a budget-exception purchase request, an RFQ with scoreable
 * quotes, a late PO, a leaking material, an overdue RFI and expiring certs.
 * Tenant-scoped only (no estateId) so an estate manager sees everything. NOW = 2026-07-26.
 */

import { SEED } from '@/server/identities';
import { money } from '@/domain/primitives';
import type {
  Project, Phase, Task, Milestone, Issue, DailyReport, Vendor, PurchaseRequest, RFQ,
  PurchaseOrder, Material, Warehouse, StockItem, StockMovement, CostCode, Variation,
  Worker, Attendance, ConstructionDoc, RFI,
} from '@/domain/construction/types';

const A = SEED.tenantA;
const ngn = (naira: number) => money(Math.round(naira * 100));

/* --- projects ------------------------------------------------------------- */

export const constructionProjects = ([
  { tenantId: A, id: 'cp-marina', projectId: 'p-marina', investorProjectId: 'p-marina', code: 'MAR-2025', name: 'Marina Heights', location: 'Lekki Phase 2, Lagos', clientName: '7 Fifteen Capital', pmName: 'Ngozi Okafor', status: 'active', contractValue: ngn(4_800_000_000), approvedBudget: ngn(4_200_000_000), startISO: '2025-03-01', plannedFinishISO: '2027-06-30', actualStartISO: '2025-03-10', plannedPercent: 45, percentComplete: 36 },
  { tenantId: A, id: 'cp-cedar', projectId: 'p-cedar', investorProjectId: 'p-cedar', code: 'CED-2024', name: 'Cedar Court', location: 'Ikate, Lagos', clientName: '7 Fifteen Capital', pmName: 'Bola Adeyemi', status: 'closing', contractValue: ngn(2_240_000_000), approvedBudget: ngn(2_000_000_000), startISO: '2024-02-01', plannedFinishISO: '2026-12-15', actualStartISO: '2024-02-05', plannedPercent: 90, percentComplete: 88 },
  { tenantId: A, id: 'cp-orchard', projectId: 'cp-orchard', code: 'ORC-2026', name: 'Orchard Residences', location: 'Ikeja GRA, Lagos', clientName: 'Palmwood Devco', pmName: 'Ngozi Okafor', status: 'planning', contractValue: ngn(1_700_000_000), approvedBudget: ngn(1_500_000_000), startISO: '2026-05-01', plannedFinishISO: '2028-02-28', actualStartISO: '2026-05-20', plannedPercent: 15, percentComplete: 12 },
] as unknown) as Project[];

/* --- phases --------------------------------------------------------------- */

export const constructionPhases = ([
  { tenantId: A, id: 'ph-m1', projectId: 'cp-marina', name: 'Enabling & foundation', order: 1, startISO: '2025-03-10', finishISO: '2025-08-30', weight: 15, percentComplete: 100 },
  { tenantId: A, id: 'ph-m2', projectId: 'cp-marina', name: 'Substructure', order: 2, startISO: '2025-09-01', finishISO: '2026-02-28', weight: 20, percentComplete: 100 },
  { tenantId: A, id: 'ph-m3', projectId: 'cp-marina', name: 'Superstructure', order: 3, startISO: '2026-03-01', finishISO: '2026-11-30', weight: 30, percentComplete: 42 },
  { tenantId: A, id: 'ph-m4', projectId: 'cp-marina', name: 'MEP first fix', order: 4, startISO: '2026-10-01', finishISO: '2027-03-31', weight: 20, percentComplete: 3 },
  { tenantId: A, id: 'ph-m5', projectId: 'cp-marina', name: 'Finishes', order: 5, startISO: '2027-02-01', finishISO: '2027-06-30', weight: 15, percentComplete: 0 },
  { tenantId: A, id: 'ph-c1', projectId: 'cp-cedar', name: 'Finishes', order: 4, startISO: '2026-06-01', finishISO: '2026-11-15', weight: 25, percentComplete: 82 },
  { tenantId: A, id: 'ph-c2', projectId: 'cp-cedar', name: 'Handover & snagging', order: 5, startISO: '2026-11-01', finishISO: '2026-12-15', weight: 10, percentComplete: 20 },
  { tenantId: A, id: 'ph-o1', projectId: 'cp-orchard', name: 'Design & enabling', order: 1, startISO: '2026-05-20', finishISO: '2026-10-31', weight: 15, percentComplete: 40 },
] as unknown) as Phase[];

/* --- tasks (Marina superstructure — real dependencies for the critical path) */

export const constructionTasks = ([
  { tenantId: A, id: 'tk-m1', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L4 columns & shear walls', owner: 'Emeka Nwosu', plannedStartISO: '2026-06-01', plannedFinishISO: '2026-06-28', actualStartISO: '2026-06-03', actualFinishISO: '2026-06-30', percentComplete: 100, status: 'done', priority: 'high', dependsOn: [], budget: ngn(180_000_000) },
  { tenantId: A, id: 'tk-m2', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L4 slab formwork & rebar', owner: 'Emeka Nwosu', plannedStartISO: '2026-06-29', plannedFinishISO: '2026-07-20', actualStartISO: '2026-07-02', percentComplete: 80, status: 'in_progress', priority: 'high', dependsOn: ['tk-m1'], budget: ngn(150_000_000) },
  { tenantId: A, id: 'tk-m3', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L4 slab concrete pour', owner: 'Emeka Nwosu', plannedStartISO: '2026-07-21', plannedFinishISO: '2026-07-27', percentComplete: 0, status: 'blocked', priority: 'high', dependsOn: ['tk-m2'], budget: ngn(90_000_000) },
  { tenantId: A, id: 'tk-m4', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L5 columns & shear walls', owner: 'Tunde Bakare', plannedStartISO: '2026-07-28', plannedFinishISO: '2026-08-24', percentComplete: 0, status: 'not_started', priority: 'high', dependsOn: ['tk-m3'], budget: ngn(180_000_000) },
  { tenantId: A, id: 'tk-m5', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L4 blockwork', owner: 'Chike Obi', plannedStartISO: '2026-07-28', plannedFinishISO: '2026-08-18', percentComplete: 0, status: 'not_started', priority: 'medium', dependsOn: ['tk-m3'], budget: ngn(70_000_000) },
  { tenantId: A, id: 'tk-m6', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L5 slab formwork & rebar', owner: 'Tunde Bakare', plannedStartISO: '2026-08-25', plannedFinishISO: '2026-09-14', percentComplete: 0, status: 'not_started', priority: 'high', dependsOn: ['tk-m4'], budget: ngn(150_000_000) },
  { tenantId: A, id: 'tk-m7', projectId: 'cp-marina', phaseId: 'ph-m4', name: 'L4 MEP first-fix conduits', owner: 'Sola Adeniyi', plannedStartISO: '2026-08-19', plannedFinishISO: '2026-09-09', percentComplete: 0, status: 'not_started', priority: 'medium', dependsOn: ['tk-m5'], budget: ngn(60_000_000) },
  { tenantId: A, id: 'tk-c1', projectId: 'cp-cedar', phaseId: 'ph-c1', name: 'Apartment tiling — Block A', owner: 'Grace Umeh', plannedStartISO: '2026-07-01', plannedFinishISO: '2026-07-31', actualStartISO: '2026-07-02', percentComplete: 70, status: 'in_progress', priority: 'high', dependsOn: [], budget: ngn(85_000_000) },
  { tenantId: A, id: 'tk-c2', projectId: 'cp-cedar', phaseId: 'ph-c2', name: 'Snagging & PC inspection', owner: 'Bola Adeyemi', plannedStartISO: '2026-11-01', plannedFinishISO: '2026-12-10', percentComplete: 0, status: 'not_started', priority: 'high', dependsOn: ['tk-c1'], budget: ngn(30_000_000) },
] as unknown) as Task[];

export const constructionMilestones = ([
  { tenantId: A, id: 'ms-m1', projectId: 'cp-marina', name: 'Superstructure topped out', dueISO: '2026-08-15', status: 'at_risk', evidence: 'Structural sign-off pending L5 pour' },
  { tenantId: A, id: 'ms-m2', projectId: 'cp-marina', name: 'Substructure complete', dueISO: '2026-02-28', status: 'accepted', evidence: 'SI-014 signed' },
  { tenantId: A, id: 'ms-c1', projectId: 'cp-cedar', name: 'Practical completion', dueISO: '2026-12-15', status: 'pending' },
] as unknown) as Milestone[];

export const constructionIssues = ([
  { tenantId: A, id: 'is-m1', projectId: 'cp-marina', category: 'Materials', title: 'Rebar delivery delayed — L4 slab pour blocked', severity: 'critical', owner: 'Ngozi Okafor', raisedISO: '2026-07-21', dueISO: '2026-07-25', status: 'open', correctiveAction: 'Expedite PO-3012; source local backup supplier' },
  { tenantId: A, id: 'is-m2', projectId: 'cp-marina', category: 'Quality', title: 'Honeycombing on L3 column C12', severity: 'medium', owner: 'Emeka Nwosu', raisedISO: '2026-07-18', dueISO: '2026-07-30', status: 'in_progress', correctiveAction: 'Grout repair + engineer inspection' },
  { tenantId: A, id: 'is-c1', projectId: 'cp-cedar', category: 'Snagging', title: 'Paint touch-ups Block A corridors', severity: 'low', owner: 'Grace Umeh', raisedISO: '2026-07-20', dueISO: '2026-08-05', status: 'open' },
] as unknown) as Issue[];

/* --- daily site reports --------------------------------------------------- */

export const constructionReports = ([
  { tenantId: A, id: 'dr-m1', projectId: 'cp-marina', dateISO: '2026-07-24', weather: 'Sunny · 31°C', shift: 'Day', officer: 'Emeka Nwosu', workforceCount: 64, completed: ['L4 columns struck', 'Rebar fixing 60% of slab'], ongoing: ['L4 slab formwork'], delayed: ['Slab pour — awaiting rebar'], plannedNext: ['Complete rebar fixing'], deliveries: ['22 tonnes cement (WB-1182)'], incidents: [], constraints: ['Rebar stock low'], photos: 8, status: 'approved' },
  { tenantId: A, id: 'dr-m2', projectId: 'cp-marina', dateISO: '2026-07-25', weather: 'Cloudy · 29°C', shift: 'Day', officer: 'Emeka Nwosu', workforceCount: 58, completed: ['Rebar fixing 80%'], ongoing: ['Formwork snag correction'], delayed: ['Slab pour'], plannedNext: ['Await rebar delivery', 'Prep pour'], deliveries: [], incidents: ['Minor hand injury — first aid only'], constraints: ['Rebar delivery still outstanding'], photos: 5, status: 'submitted' },
  { tenantId: A, id: 'dr-m3', projectId: 'cp-marina', dateISO: '2026-07-26', weather: 'Sunny · 32°C', shift: 'Day', officer: 'Emeka Nwosu', workforceCount: 61, completed: [], ongoing: ['Rebar fixing'], delayed: [], plannedNext: [], deliveries: [], incidents: [], constraints: [], photos: 2, status: 'draft' },
  { tenantId: A, id: 'dr-c1', projectId: 'cp-cedar', dateISO: '2026-07-25', weather: 'Sunny · 30°C', shift: 'Day', officer: 'Grace Umeh', workforceCount: 26, completed: ['Block A tiling L2'], ongoing: ['Block A tiling L3'], delayed: [], plannedNext: ['Grouting L2'], deliveries: ['Tiles 400 boxes'], incidents: [], constraints: [], photos: 6, status: 'approved' },
] as unknown) as DailyReport[];

/* --- procurement ---------------------------------------------------------- */

export const constructionVendors = ([
  { tenantId: A, id: 'v-steelforce', name: 'SteelForce Nigeria', category: 'Reinforcement', rating: 4.6, onTimePct: 88, qualityIncidents: 1, complianceExpiryISO: '2027-01-31' },
  { tenantId: A, id: 'v-dangote', name: 'Dangote Cement Depot', category: 'Cement & aggregates', rating: 4.8, onTimePct: 95, qualityIncidents: 0, complianceExpiryISO: '2027-06-30' },
  { tenantId: A, id: 'v-blockmasters', name: 'BlockMasters Ltd', category: 'Blocks & masonry', rating: 4.1, onTimePct: 79, qualityIncidents: 2, complianceExpiryISO: '2026-09-15' },
  { tenantId: A, id: 'v-meppro', name: 'MEP Pro Services', category: 'M&E', rating: 4.3, onTimePct: 84, qualityIncidents: 1, complianceExpiryISO: '2026-08-05' },
  { tenantId: A, id: 'v-oldline', name: 'Oldline Suppliers', category: 'General', rating: 2.9, onTimePct: 61, qualityIncidents: 5, complianceExpiryISO: '2026-06-30', suspended: true },
] as unknown) as Vendor[];

export const constructionRequests = ([
  { tenantId: A, id: 'pr-m1', ref: 'PR-4021', projectId: 'cp-marina', item: 'Y16 reinforcement bar', qty: 40, unit: 'tonne', costCode: 'MAR-SUP', estimate: ngn(52_000_000), requiredISO: '2026-07-25', requestedBy: 'Emeka Nwosu', status: 'approved', justification: 'L4/L5 slab & column rebar' },
  { tenantId: A, id: 'pr-m2', ref: 'PR-4025', projectId: 'cp-marina', item: 'Tower crane extended hire (2 mo)', qty: 2, unit: 'month', costCode: 'MAR-PRE', estimate: ngn(120_000_000), requiredISO: '2026-08-01', requestedBy: 'Ngozi Okafor', status: 'pending', justification: 'Superstructure slip needs crane beyond plan' },
  { tenantId: A, id: 'pr-m3', ref: 'PR-4026', projectId: 'cp-marina', item: 'Ready-mix concrete C30', qty: 220, unit: 'm³', costCode: 'MAR-SUP', estimate: ngn(31_000_000), requiredISO: '2026-07-28', requestedBy: 'Emeka Nwosu', status: 'rfq', justification: 'L4 slab pour' },
  { tenantId: A, id: 'pr-c1', ref: 'PR-4030', projectId: 'cp-cedar', item: 'Porcelain floor tiles 600x600', qty: 900, unit: 'box', costCode: 'CED-FIN', estimate: ngn(18_000_000), requiredISO: '2026-07-30', requestedBy: 'Grace Umeh', status: 'approved', justification: 'Block A finishes' },
] as unknown) as PurchaseRequest[];

export const constructionRfqs = ([
  { tenantId: A, id: 'rfq-m1', ref: 'RFQ-2208', requestRef: 'PR-4026', projectId: 'cp-marina', item: 'Ready-mix concrete C30', qty: 220, unit: 'm³', status: 'comparing', quotes: [
    { vendorId: 'v-dangote', vendorName: 'Dangote Cement Depot', price: ngn(30_800_000), leadDays: 2, warrantyMonths: 0, compliancePct: 100 },
    { vendorId: 'v-blockmasters', vendorName: 'BlockMasters Ltd', price: ngn(28_600_000), leadDays: 5, warrantyMonths: 0, compliancePct: 80 },
    { vendorId: 'v-steelforce', vendorName: 'SteelForce Nigeria', price: ngn(33_500_000), leadDays: 1, warrantyMonths: 0, compliancePct: 95 },
  ] },
] as unknown) as RFQ[];

export const constructionOrders = ([
  { tenantId: A, id: 'po-m1', ref: 'PO-3012', projectId: 'cp-marina', vendorId: 'v-steelforce', vendorName: 'SteelForce Nigeria', item: 'Y16 reinforcement bar', qty: 40, unit: 'tonne', costCode: 'MAR-SUP', value: ngn(52_000_000), status: 'issued', issuedISO: '2026-07-15', expectedISO: '2026-07-22', deliveredQty: 0 },
  { tenantId: A, id: 'po-m2', ref: 'PO-3008', projectId: 'cp-marina', vendorId: 'v-dangote', vendorName: 'Dangote Cement Depot', item: 'Cement 42.5R', qty: 1200, unit: 'bag', costCode: 'MAR-SUP', value: ngn(24_000_000), status: 'part_delivered', issuedISO: '2026-07-10', expectedISO: '2026-07-24', deliveredQty: 800 },
  { tenantId: A, id: 'po-c1', ref: 'PO-3014', projectId: 'cp-cedar', vendorId: 'v-blockmasters', vendorName: 'BlockMasters Ltd', item: 'Porcelain floor tiles', qty: 900, unit: 'box', costCode: 'CED-FIN', value: ngn(18_000_000), status: 'delivered', issuedISO: '2026-07-12', expectedISO: '2026-07-22', deliveredQty: 900 },
] as unknown) as PurchaseOrder[];

/* --- inventory & materials ------------------------------------------------ */

export const constructionMaterials = ([
  { tenantId: A, id: 'mat-cement', sku: 'CEM-425R', name: 'Cement 42.5R', category: 'Binders', unit: 'bag', reorderLevel: 300, unitCost: ngn(9_500) },
  { tenantId: A, id: 'mat-rebar', sku: 'RBR-Y16', name: 'Y16 reinforcement bar', category: 'Reinforcement', unit: 'tonne', reorderLevel: 8, unitCost: ngn(1_300_000) },
  { tenantId: A, id: 'mat-blocks', sku: 'BLK-225', name: '225mm hollow block', category: 'Masonry', unit: 'unit', reorderLevel: 2000, unitCost: ngn(650) },
  { tenantId: A, id: 'mat-tiles', sku: 'TIL-600', name: 'Porcelain tile 600x600', category: 'Finishes', unit: 'box', reorderLevel: 100, unitCost: ngn(19_500) },
  { tenantId: A, id: 'mat-diesel', sku: 'DSL-AGO', name: 'Diesel (AGO)', category: 'Fuel', unit: 'litre', reorderLevel: 2000, unitCost: ngn(1_300) },
] as unknown) as Material[];

export const constructionWarehouses = ([
  { tenantId: A, id: 'wh-central', name: 'Central Store — Ikate', kind: 'central' },
  { tenantId: A, id: 'wh-marina', name: 'Marina Heights Site Store', kind: 'site_store', projectId: 'cp-marina' },
  { tenantId: A, id: 'wh-cedar', name: 'Cedar Court Site Store', kind: 'site_store', projectId: 'cp-cedar' },
] as unknown) as Warehouse[];

export const constructionStock = ([
  { tenantId: A, id: 'st-1', materialId: 'mat-cement', warehouseId: 'wh-marina', onHand: 640, reserved: 200, inTransit: 400 },
  { tenantId: A, id: 'st-2', materialId: 'mat-rebar', warehouseId: 'wh-marina', onHand: 5, reserved: 4, inTransit: 40 },
  { tenantId: A, id: 'st-3', materialId: 'mat-blocks', warehouseId: 'wh-marina', onHand: 5400, reserved: 800, inTransit: 0 },
  { tenantId: A, id: 'st-4', materialId: 'mat-diesel', warehouseId: 'wh-marina', onHand: 1400, reserved: 0, inTransit: 0 },
  { tenantId: A, id: 'st-5', materialId: 'mat-tiles', warehouseId: 'wh-cedar', onHand: 260, reserved: 120, inTransit: 0 },
] as unknown) as StockItem[];

export const constructionMovements = ([
  { tenantId: A, id: 'sm-1', materialId: 'mat-rebar', kind: 'receipt', qty: 60, atISO: '2026-06-20', projectId: 'cp-marina', costCode: 'MAR-SUP', ref: 'GRN-880', by: 'Store' },
  { tenantId: A, id: 'sm-2', materialId: 'mat-rebar', kind: 'issue', qty: 33, atISO: '2026-07-05', projectId: 'cp-marina', costCode: 'MAR-SUP', ref: 'MI-451', by: 'Emeka Nwosu' },
  { tenantId: A, id: 'sm-3', materialId: 'mat-rebar', kind: 'issue', qty: 15, atISO: '2026-07-18', projectId: 'cp-marina', costCode: 'MAR-SUP', ref: 'MI-460', by: 'Emeka Nwosu' },
  { tenantId: A, id: 'sm-4', materialId: 'mat-cement', kind: 'receipt', qty: 800, atISO: '2026-07-24', projectId: 'cp-marina', costCode: 'MAR-SUP', ref: 'GRN-902', by: 'Store' },
  { tenantId: A, id: 'sm-5', materialId: 'mat-cement', kind: 'issue', qty: 360, atISO: '2026-07-25', projectId: 'cp-marina', costCode: 'MAR-SUP', ref: 'MI-470', by: 'Emeka Nwosu' },
] as unknown) as StockMovement[];

/* --- cost control --------------------------------------------------------- */

export const constructionCostCodes = ([
  { tenantId: A, id: 'cc-m-pre', projectId: 'cp-marina', code: 'MAR-PRE', name: 'Preliminaries', category: 'Prelims', budget: ngn(300_000_000), committed: ngn(210_000_000), actual: ngn(180_000_000), plannedPercent: 60, earnedPercent: 55 },
  { tenantId: A, id: 'cc-m-sub', projectId: 'cp-marina', code: 'MAR-SUB', name: 'Substructure', category: 'Structure', budget: ngn(900_000_000), committed: ngn(930_000_000), actual: ngn(930_000_000), plannedPercent: 100, earnedPercent: 100 },
  { tenantId: A, id: 'cc-m-sup', projectId: 'cp-marina', code: 'MAR-SUP', name: 'Superstructure', category: 'Structure', budget: ngn(1_400_000_000), committed: ngn(520_000_000), actual: ngn(450_000_000), plannedPercent: 40, earnedPercent: 30 },
  { tenantId: A, id: 'cc-m-mep', projectId: 'cp-marina', code: 'MAR-MEP', name: 'MEP services', category: 'Services', budget: ngn(900_000_000), committed: ngn(40_000_000), actual: ngn(20_000_000), plannedPercent: 5, earnedPercent: 2 },
  { tenantId: A, id: 'cc-m-fin', projectId: 'cp-marina', code: 'MAR-FIN', name: 'Finishes', category: 'Finishes', budget: ngn(700_000_000), committed: ngn(0), actual: ngn(0), plannedPercent: 0, earnedPercent: 0 },
  { tenantId: A, id: 'cc-c-fin', projectId: 'cp-cedar', code: 'CED-FIN', name: 'Finishes', category: 'Finishes', budget: ngn(520_000_000), committed: ngn(470_000_000), actual: ngn(455_000_000), plannedPercent: 90, earnedPercent: 82 },
  { tenantId: A, id: 'cc-c-str', projectId: 'cp-cedar', code: 'CED-STR', name: 'Structure', category: 'Structure', budget: ngn(1_100_000_000), committed: ngn(1_100_000_000), actual: ngn(1_120_000_000), plannedPercent: 100, earnedPercent: 100 },
] as unknown) as CostCode[];

export const constructionVariations = ([
  { tenantId: A, id: 'var-m1', ref: 'VO-07', projectId: 'cp-marina', title: 'Upgrade lobby cladding to granite', reason: 'Client-requested spec upgrade', costImpact: ngn(64_000_000), scheduleImpactDays: 12, status: 'client_review', raisedISO: '2026-07-14' },
  { tenantId: A, id: 'var-m2', ref: 'VO-06', projectId: 'cp-marina', title: 'Additional dewatering — high water table', reason: 'Unforeseen ground condition', costImpact: ngn(28_000_000), scheduleImpactDays: 6, status: 'approved', raisedISO: '2026-05-02' },
  { tenantId: A, id: 'var-c1', ref: 'VO-11', projectId: 'cp-cedar', title: 'Rooftop terrace pergola', reason: 'Client addition', costImpact: ngn(15_000_000), scheduleImpactDays: 8, status: 'submitted', raisedISO: '2026-07-19' },
] as unknown) as Variation[];

/* --- workforce ------------------------------------------------------------ */

export const constructionWorkers = ([
  { tenantId: A, id: 'w-m1', name: 'Emeka Nwosu', trade: 'Site foreman', kind: 'employee', projectId: 'cp-marina', crew: 'A', company: '7 Fifteen', dayRate: ngn(35_000), certName: 'Scaffold supervisor', certExpiryISO: '2026-08-10' },
  { tenantId: A, id: 'w-m2', name: 'Tunde Bakare', trade: 'Concrete gang lead', kind: 'subcontractor', projectId: 'cp-marina', crew: 'B', company: 'BuildRight Subs', dayRate: ngn(28_000), certName: 'Working at height', certExpiryISO: '2026-07-10' },
  { tenantId: A, id: 'w-m3', name: 'Chike Obi', trade: 'Mason', kind: 'subcontractor', projectId: 'cp-marina', crew: 'B', company: 'BuildRight Subs', dayRate: ngn(18_000) },
  { tenantId: A, id: 'w-m4', name: 'Sola Adeniyi', trade: 'Electrician', kind: 'subcontractor', projectId: 'cp-marina', crew: 'MEP', company: 'MEP Pro Services', dayRate: ngn(22_000), certName: 'Electrical license', certExpiryISO: '2027-02-28' },
  { tenantId: A, id: 'w-m5', name: 'Ibrahim Musa', trade: 'Steel fixer', kind: 'subcontractor', projectId: 'cp-marina', crew: 'B', company: 'BuildRight Subs', dayRate: ngn(20_000) },
  { tenantId: A, id: 'w-c1', name: 'Grace Umeh', trade: 'Finishing foreman', kind: 'employee', projectId: 'cp-cedar', crew: 'F', company: '7 Fifteen', dayRate: ngn(32_000), certName: 'First aid', certExpiryISO: '2026-11-30' },
  { tenantId: A, id: 'w-c2', name: 'Peter Adeleke', trade: 'Tiler', kind: 'temp', projectId: 'cp-cedar', crew: 'F', company: 'Daywork', dayRate: ngn(16_000) },
] as unknown) as Worker[];

export const constructionAttendance = ([
  { tenantId: A, id: 'at-1', workerId: 'w-m1', projectId: 'cp-marina', dateISO: '2026-07-26', clockIn: '07:02', clockOut: '17:10', hours: 9.5, overtime: 1, method: 'gps', withinGeofence: true, status: 'present' },
  { tenantId: A, id: 'at-2', workerId: 'w-m2', projectId: 'cp-marina', dateISO: '2026-07-26', clockIn: '07:15', hours: 0, overtime: 0, method: 'qr', withinGeofence: true, status: 'present' },
  { tenantId: A, id: 'at-3', workerId: 'w-m3', projectId: 'cp-marina', dateISO: '2026-07-26', clockIn: '07:20', hours: 0, overtime: 0, method: 'gps', withinGeofence: true, status: 'present' },
  { tenantId: A, id: 'at-4', workerId: 'w-m5', projectId: 'cp-marina', dateISO: '2026-07-26', hours: 0, overtime: 0, method: 'manual', withinGeofence: false, status: 'absent' },
  { tenantId: A, id: 'at-5', workerId: 'w-c1', projectId: 'cp-cedar', dateISO: '2026-07-26', clockIn: '07:05', hours: 0, overtime: 0, method: 'gps', withinGeofence: true, status: 'present' },
] as unknown) as Attendance[];

/* --- documents & RFIs ----------------------------------------------------- */

export const constructionDocs = ([
  { tenantId: A, id: 'doc-m1', projectId: 'cp-marina', number: 'MAR-ST-104', title: 'L4 slab reinforcement layout', discipline: 'Structural', revision: 'C', status: 'approved', effectiveISO: '2026-06-10', folder: 'Drawings / Structural' },
  { tenantId: A, id: 'doc-m2', projectId: 'cp-marina', number: 'MAR-ST-104', title: 'L4 slab reinforcement layout', discipline: 'Structural', revision: 'B', status: 'superseded', effectiveISO: '2026-04-02', folder: 'Drawings / Structural' },
  { tenantId: A, id: 'doc-m3', projectId: 'cp-marina', number: 'MAR-ME-210', title: 'L4 MEP coordination', discipline: 'M&E', revision: 'A', status: 'review', effectiveISO: '2026-07-20', folder: 'Drawings / M&E' },
  { tenantId: A, id: 'doc-c1', projectId: 'cp-cedar', number: 'CED-AR-330', title: 'Block A finishes schedule', discipline: 'Architectural', revision: 'D', status: 'approved', effectiveISO: '2026-06-25', folder: 'Drawings / Architectural' },
] as unknown) as ConstructionDoc[];

export const constructionRfis = ([
  { tenantId: A, id: 'rfi-m1', ref: 'RFI-058', projectId: 'cp-marina', question: 'Confirm starter bar lap length at L4/L5 column kicker', discipline: 'Structural', drawingRef: 'MAR-ST-104', raisedBy: 'Emeka Nwosu', assignedTo: 'Structural Engineer', raisedISO: '2026-07-12', dueISO: '2026-07-18', status: 'open' },
  { tenantId: A, id: 'rfi-m2', ref: 'RFI-055', projectId: 'cp-marina', question: 'Waterproofing spec for L4 wet areas', discipline: 'Architectural', drawingRef: 'MAR-AR-118', raisedBy: 'Ngozi Okafor', assignedTo: 'Architect', raisedISO: '2026-07-02', dueISO: '2026-07-09', status: 'answered', answer: 'Use 2-coat cementitious membrane per spec 07-14', answeredISO: '2026-07-08' },
  { tenantId: A, id: 'rfi-c1', ref: 'RFI-061', projectId: 'cp-cedar', question: 'Skirting detail at lift lobby', discipline: 'Architectural', drawingRef: 'CED-AR-330', raisedBy: 'Grace Umeh', assignedTo: 'Architect', raisedISO: '2026-07-22', dueISO: '2026-07-29', status: 'open' },
] as unknown) as RFI[];
