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
  Worker, Attendance, ConstructionDoc, RFI, Zone, Subcontractor, SafetyPermit, SafetyEvent, ToolboxTalk, Timesheet, Transmittal, ReasonCode, ReasonEvent, ApprovalRule, ApprovalRequest, AuditEntry,
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
  { tenantId: A, id: 'tk-m2', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L4 slab formwork & rebar', owner: 'Emeka Nwosu', plannedStartISO: '2026-06-29', plannedFinishISO: '2026-07-20', actualStartISO: '2026-07-02', percentComplete: 80, status: 'in_progress', priority: 'high', dependsOn: ['tk-m1'], budget: ngn(150_000_000), zoneId: 'z-m-l4', crash: { crashableDays: 5, crashCostPerDay: ngn(1_800_000) } },
  { tenantId: A, id: 'tk-m3', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L4 slab concrete pour', owner: 'Emeka Nwosu', plannedStartISO: '2026-07-21', plannedFinishISO: '2026-07-27', percentComplete: 0, status: 'blocked', priority: 'high', dependsOn: ['tk-m2'], budget: ngn(90_000_000), zoneId: 'z-m-l4', crash: { crashableDays: 2, crashCostPerDay: ngn(3_200_000) } },
  { tenantId: A, id: 'tk-m4', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L5 columns & shear walls', owner: 'Tunde Bakare', plannedStartISO: '2026-07-28', plannedFinishISO: '2026-08-24', percentComplete: 0, status: 'not_started', priority: 'high', dependsOn: ['tk-m3'], budget: ngn(180_000_000), zoneId: 'z-m-l5', crash: { crashableDays: 6, crashCostPerDay: ngn(2_400_000) } },
  { tenantId: A, id: 'tk-m5', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L4 blockwork', owner: 'Chike Obi', plannedStartISO: '2026-07-28', plannedFinishISO: '2026-08-18', percentComplete: 0, status: 'not_started', priority: 'medium', dependsOn: ['tk-m3'], budget: ngn(70_000_000), zoneId: 'z-m-l4' },
  { tenantId: A, id: 'tk-m6', projectId: 'cp-marina', phaseId: 'ph-m3', name: 'L5 slab formwork & rebar', owner: 'Tunde Bakare', plannedStartISO: '2026-08-25', plannedFinishISO: '2026-09-14', percentComplete: 0, status: 'not_started', priority: 'high', dependsOn: ['tk-m4'], budget: ngn(150_000_000), zoneId: 'z-m-l5', crash: { crashableDays: 4, crashCostPerDay: ngn(1_500_000) } },
  { tenantId: A, id: 'tk-m7', projectId: 'cp-marina', phaseId: 'ph-m4', name: 'L4 MEP first-fix conduits', owner: 'Sola Adeniyi', plannedStartISO: '2026-08-19', plannedFinishISO: '2026-09-09', percentComplete: 0, status: 'not_started', priority: 'medium', dependsOn: ['tk-m5'], budget: ngn(60_000_000), zoneId: 'z-m-l4' },
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

/* --- site twin: Marina Heights, floor by floor ---------------------------- */

/** Structure is topping out at L4/L5 while finishes trail far below — the shape
 *  of a real superstructure build, and what the twin visualises. */
export const constructionZones = ([
  { tenantId: A, id: 'z-m-l1', projectId: 'cp-marina', level: 1, label: 'Level 1', block: 'Tower', layers: { structure: 100, blockwork: 100, mep: 85, finishes: 40 }, openIssues: 0, openRfis: 0 },
  { tenantId: A, id: 'z-m-l2', projectId: 'cp-marina', level: 2, label: 'Level 2', block: 'Tower', layers: { structure: 100, blockwork: 100, mep: 70, finishes: 15 }, openIssues: 0, openRfis: 0 },
  { tenantId: A, id: 'z-m-l3', projectId: 'cp-marina', level: 3, label: 'Level 3', block: 'Tower', layers: { structure: 100, blockwork: 90, mep: 30, finishes: 0 }, openIssues: 1, openRfis: 0 },
  { tenantId: A, id: 'z-m-l4', projectId: 'cp-marina', level: 4, label: 'Level 4', block: 'Tower', layers: { structure: 80, blockwork: 0, mep: 0, finishes: 0 }, openIssues: 1, openRfis: 1 },
  { tenantId: A, id: 'z-m-l5', projectId: 'cp-marina', level: 5, label: 'Level 5', block: 'Tower', layers: { structure: 0, blockwork: 0, mep: 0, finishes: 0 }, openIssues: 0, openRfis: 0 },
  { tenantId: A, id: 'z-m-l6', projectId: 'cp-marina', level: 6, label: 'Level 6', block: 'Tower', layers: { structure: 0, blockwork: 0, mep: 0, finishes: 0 }, openIssues: 0, openRfis: 0 },
  { tenantId: A, id: 'z-c-l1', projectId: 'cp-cedar', level: 1, label: 'Block A · L1', block: 'Block A', layers: { structure: 100, blockwork: 100, mep: 100, finishes: 90 }, openIssues: 1, openRfis: 1 },
  { tenantId: A, id: 'z-c-l2', projectId: 'cp-cedar', level: 2, label: 'Block A · L2', block: 'Block A', layers: { structure: 100, blockwork: 100, mep: 100, finishes: 75 }, openIssues: 0, openRfis: 0 },
  { tenantId: A, id: 'z-c-l3', projectId: 'cp-cedar', level: 3, label: 'Block A · L3', block: 'Block A', layers: { structure: 100, blockwork: 100, mep: 95, finishes: 45 }, openIssues: 0, openRfis: 0 },
] as unknown) as Zone[];

/* --- subcontractor league ------------------------------------------------- */

export const constructionSubcontractors = ([
  { tenantId: A, id: 'sub-buildright', name: 'BuildRight Subs', trade: 'Concrete & steel', projectIds: ['cp-marina'], tasksCompleted: 24, tasksOnTime: 20, defects: 3, reworkCost: ngn(6_400_000), safetyIncidents: 1, crewSize: 34, contractValue: ngn(720_000_000) },
  { tenantId: A, id: 'sub-meppro', name: 'MEP Pro Services', trade: 'Mechanical & electrical', projectIds: ['cp-marina', 'cp-cedar'], tasksCompleted: 15, tasksOnTime: 14, defects: 1, reworkCost: ngn(1_200_000), safetyIncidents: 0, crewSize: 18, contractValue: ngn(540_000_000) },
  { tenantId: A, id: 'sub-finetouch', name: 'FineTouch Interiors', trade: 'Finishes', projectIds: ['cp-cedar'], tasksCompleted: 31, tasksOnTime: 29, defects: 2, reworkCost: ngn(2_100_000), safetyIncidents: 0, crewSize: 22, contractValue: ngn(310_000_000) },
  { tenantId: A, id: 'sub-groundworks', name: 'Lagos Groundworks', trade: 'Earthworks & piling', projectIds: ['cp-marina'], tasksCompleted: 12, tasksOnTime: 7, defects: 5, reworkCost: ngn(14_800_000), safetyIncidents: 2, crewSize: 26, contractValue: ngn(430_000_000) },
  { tenantId: A, id: 'sub-glazepro', name: 'GlazePro Facades', trade: 'Facade & glazing', projectIds: ['cp-marina'], tasksCompleted: 8, tasksOnTime: 8, defects: 0, reworkCost: ngn(0), safetyIncidents: 0, crewSize: 12, contractValue: ngn(280_000_000) },
] as unknown) as Subcontractor[];

/* --- safety --------------------------------------------------------------- */

export const constructionSafetyPermits = ([
  { tenantId: A, id: 'sp-1', ref: 'PTW-9101', projectId: 'cp-marina', type: 'hot_work', zoneId: 'z-m-l4', location: 'Level 4 · east core', requestedBy: 'Emeka Nwosu', supervisor: 'Ngozi Okafor', status: 'active', validFromISO: '2026-07-26', validToISO: '2026-07-27', controls: ['Fire watch posted', 'Extinguisher within 5m', 'Combustibles cleared 10m'] },
  { tenantId: A, id: 'sp-2', ref: 'PTW-9102', projectId: 'cp-marina', type: 'height', zoneId: 'z-m-l4', location: 'Level 4 · east core', requestedBy: 'Tunde Bakare', supervisor: 'Ngozi Okafor', status: 'active', validFromISO: '2026-07-26', validToISO: '2026-07-28', controls: ['Harness + twin lanyard', 'Edge protection checked', 'Rescue plan briefed'] },
  { tenantId: A, id: 'sp-3', ref: 'PTW-9098', projectId: 'cp-marina', type: 'lifting', zoneId: 'z-m-l5', location: 'Level 5 · crane zone', requestedBy: 'Tunde Bakare', supervisor: 'Ngozi Okafor', status: 'active', validFromISO: '2026-07-20', validToISO: '2026-07-24', controls: ['Lift plan signed', 'Exclusion zone barriered'] },
  { tenantId: A, id: 'sp-4', ref: 'PTW-9103', projectId: 'cp-cedar', type: 'electrical', location: 'Block A · riser', requestedBy: 'Sola Adeniyi', supervisor: 'Bola Adeyemi', status: 'requested', validFromISO: '2026-07-28', validToISO: '2026-07-29', controls: ['Lock-out tag-out', 'Proved dead before touch'] },
  { tenantId: A, id: 'sp-5', ref: 'PTW-9090', projectId: 'cp-marina', type: 'excavation', location: 'Site perimeter · north', requestedBy: 'Chike Obi', supervisor: 'Ngozi Okafor', status: 'closed', validFromISO: '2026-07-08', validToISO: '2026-07-12', controls: ['Services scanned', 'Shoring installed'] },
] as unknown) as SafetyPermit[];

export const constructionSafetyEvents = ([
  { tenantId: A, id: 'se-1', projectId: 'cp-marina', kind: 'first_aid', title: 'Hand laceration handling rebar tie wire', zoneId: 'z-m-l4', atISO: '2026-07-25', reportedBy: 'Emeka Nwosu', lostDays: 0, closed: true, action: 'Cut-resistant gloves reissued to the steel gang' },
  { tenantId: A, id: 'se-2', projectId: 'cp-marina', kind: 'near_miss', title: 'Scaffold board dislodged near L3 edge', zoneId: 'z-m-l3', atISO: '2026-07-23', reportedBy: 'Chike Obi', lostDays: 0, closed: true, action: 'Board clips checked estate-wide; scaffold inspection brought forward' },
  { tenantId: A, id: 'se-3', projectId: 'cp-marina', kind: 'near_miss', title: 'Reversing truck without banksman at gate', atISO: '2026-07-19', reportedBy: 'Musa Ibrahim', lostDays: 0, closed: true, action: 'Banksman mandatory for all deliveries; gate marshal briefed' },
  { tenantId: A, id: 'se-4', projectId: 'cp-marina', kind: 'lost_time', title: 'Ankle fracture — trip on uncovered service duct', zoneId: 'z-m-l2', atISO: '2026-06-11', reportedBy: 'Ngozi Okafor', lostDays: 14, closed: true, action: 'All duct openings covered and marked; housekeeping audit weekly' },
  { tenantId: A, id: 'se-5', projectId: 'cp-cedar', kind: 'observation', title: 'Good practice — tile offcuts bagged at source', zoneId: 'z-c-l3', atISO: '2026-07-24', reportedBy: 'Grace Umeh', lostDays: 0, closed: true },
  { tenantId: A, id: 'se-6', projectId: 'cp-marina', kind: 'observation', title: 'Housekeeping poor at L4 material drop', zoneId: 'z-m-l4', atISO: '2026-07-26', reportedBy: 'Ngozi Okafor', lostDays: 0, closed: false, action: 'Clear before next pour' },
] as unknown) as SafetyEvent[];

export const constructionToolboxTalks = ([
  { tenantId: A, id: 'tb-1', projectId: 'cp-marina', topic: 'Working at height — edge protection', atISO: '2026-07-24', attendees: 58, deliveredBy: 'Ngozi Okafor' },
  { tenantId: A, id: 'tb-2', projectId: 'cp-marina', topic: 'Hot work & fire watch discipline', atISO: '2026-07-17', attendees: 61, deliveredBy: 'Emeka Nwosu' },
  { tenantId: A, id: 'tb-3', projectId: 'cp-cedar', topic: 'Manual handling — tile boxes', atISO: '2026-07-21', attendees: 24, deliveredBy: 'Grace Umeh' },
] as unknown) as ToolboxTalk[];

/* --- timesheets (labour → cost codes → earned value) ---------------------- */

/** Two weeks approved and already posted into MAR-SUP's actual, plus a live
 *  week awaiting approval — so the Timesheets page can show cost the EVM does
 *  NOT yet see, and approving it visibly moves CPI. */
export const constructionTimesheets = ([
  { tenantId: A, id: 'ts-1', ref: 'TS-0311', projectId: 'cp-marina', workerId: 'w-m1', workerName: 'Emeka Nwosu', weekEndingISO: '2026-07-12', costCode: 'MAR-SUP', normalHours: 48, overtimeHours: 6, status: 'approved', submittedBy: 'Emeka Nwosu', approvedBy: 'Ngozi Okafor', approvedISO: '2026-07-14', postedMinor: 1_012_500 },
  { tenantId: A, id: 'ts-2', ref: 'TS-0312', projectId: 'cp-marina', workerId: 'w-m2', workerName: 'Tunde Bakare', weekEndingISO: '2026-07-12', costCode: 'MAR-SUP', normalHours: 48, overtimeHours: 4, status: 'approved', submittedBy: 'Tunde Bakare', approvedBy: 'Ngozi Okafor', approvedISO: '2026-07-14', postedMinor: 1_012_500 },
  { tenantId: A, id: 'ts-3', ref: 'TS-0318', projectId: 'cp-marina', workerId: 'w-m1', workerName: 'Emeka Nwosu', weekEndingISO: '2026-07-19', costCode: 'MAR-SUP', normalHours: 48, overtimeHours: 10, status: 'approved', submittedBy: 'Emeka Nwosu', approvedBy: 'Ngozi Okafor', approvedISO: '2026-07-21', postedMinor: 1_181_250 },
  { tenantId: A, id: 'ts-4', ref: 'TS-0324', projectId: 'cp-marina', workerId: 'w-m1', workerName: 'Emeka Nwosu', weekEndingISO: '2026-07-26', costCode: 'MAR-SUP', normalHours: 48, overtimeHours: 12, status: 'submitted', submittedBy: 'Emeka Nwosu' },
  { tenantId: A, id: 'ts-5', ref: 'TS-0325', projectId: 'cp-marina', workerId: 'w-m2', workerName: 'Tunde Bakare', weekEndingISO: '2026-07-26', costCode: 'MAR-SUP', normalHours: 44, overtimeHours: 8, status: 'submitted', submittedBy: 'Tunde Bakare' },
  { tenantId: A, id: 'ts-6', ref: 'TS-0326', projectId: 'cp-marina', workerId: 'w-m3', workerName: 'Chike Obi', weekEndingISO: '2026-07-26', costCode: 'MAR-SUP', normalHours: 40, overtimeHours: 0, status: 'submitted', submittedBy: 'Chike Obi' },
  { tenantId: A, id: 'ts-7', ref: 'TS-0327', projectId: 'cp-marina', workerId: 'w-m4', workerName: 'Sola Adeniyi', weekEndingISO: '2026-07-26', costCode: 'MAR-MEP', normalHours: 40, overtimeHours: 2, status: 'draft', submittedBy: 'Sola Adeniyi' },
] as unknown) as Timesheet[];

/* --- transmittals (controlled distribution history) ----------------------- */

export const constructionTransmittals = ([
  { tenantId: A, id: 'tr-1', docId: 'doc-m1', docNumber: 'MAR-ST-104', revision: 'C', toParty: 'BuildRight Subs', sentISO: '2026-06-10', purpose: 'for_construction', acknowledgedISO: '2026-06-11' },
  { tenantId: A, id: 'tr-2', docId: 'doc-m1', docNumber: 'MAR-ST-104', revision: 'C', toParty: 'Site office', sentISO: '2026-06-10', purpose: 'for_construction', acknowledgedISO: '2026-06-10' },
  { tenantId: A, id: 'tr-3', docId: 'doc-m2', docNumber: 'MAR-ST-104', revision: 'B', toParty: 'BuildRight Subs', sentISO: '2026-04-02', purpose: 'for_construction', acknowledgedISO: '2026-04-03' },
  { tenantId: A, id: 'tr-4', docId: 'doc-m3', docNumber: 'MAR-ME-210', revision: 'A', toParty: 'MEP Pro Services', sentISO: '2026-07-20', purpose: 'for_review' },
] as unknown) as Transmittal[];

/* --- reason codes (the controlled vocabulary) ----------------------------- */

export const constructionReasonCodes = ([
  // rejections
  { tenantId: A, id: 'rc-r1', domain: 'rejection', code: 'REJ-BUDGET', label: 'Exceeds remaining budget', category: 'Commercial', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-r2', domain: 'rejection', code: 'REJ-SPEC', label: 'Does not meet specification', category: 'Technical', requiresNote: true, active: true },
  { tenantId: A, id: 'rc-r3', domain: 'rejection', code: 'REJ-OT', label: 'Overtime not pre-authorised', category: 'Labour', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-r4', domain: 'rejection', code: 'REJ-DOC', label: 'Supporting document missing', category: 'Governance', requiresNote: false, active: true },
  // delays
  { tenantId: A, id: 'rc-d1', domain: 'delay', code: 'DLY-MAT', label: 'Material not on site', category: 'Supply', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-d2', domain: 'delay', code: 'DLY-RAIN', label: 'Weather — rain stopped work', category: 'Weather', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-d3', domain: 'delay', code: 'DLY-RFI', label: 'Awaiting design answer (RFI)', category: 'Design', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-d4', domain: 'delay', code: 'DLY-LAB', label: 'Crew shortfall', category: 'Labour', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-d5', domain: 'delay', code: 'DLY-PWR', label: 'Power / diesel outage', category: 'Utilities', requiresNote: false, active: true },
  // variance
  { tenantId: A, id: 'rc-v1', domain: 'variance', code: 'VAR-PRICE', label: 'Market price movement', category: 'Commercial', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-v2', domain: 'variance', code: 'VAR-SCOPE', label: 'Client scope change', category: 'Scope', requiresNote: true, active: true },
  { tenantId: A, id: 'rc-v3', domain: 'variance', code: 'VAR-REWORK', label: 'Rework / defect rectification', category: 'Quality', requiresNote: true, active: true },
  // stock
  { tenantId: A, id: 'rc-s1', domain: 'stock_adjust', code: 'ADJ-DAMAGE', label: 'Damaged in storage', category: 'Loss', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-s2', domain: 'stock_adjust', code: 'ADJ-COUNT', label: 'Count correction', category: 'Records', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-s3', domain: 'stock_adjust', code: 'ADJ-THEFT', label: 'Unaccounted loss — suspected theft', category: 'Loss', requiresNote: true, active: true },
  { tenantId: A, id: 'rc-s4', domain: 'stock_return', code: 'RET-SURPLUS', label: 'Surplus returned from site', category: 'Surplus', requiresNote: false, active: true },
  { tenantId: A, id: 'rc-s5', domain: 'stock_return', code: 'RET-WRONG', label: 'Wrong item issued', category: 'Error', requiresNote: false, active: true },
] as unknown) as ReasonCode[];

/** Real usage, weighted so the Pareto has a clear vital few: material-on-site
 *  and RFI waits dominate delays — the story the data should tell. */
export const constructionReasonEvents = ([
  { tenantId: A, id: 're-1', domain: 'delay', codeId: 'rc-d1', subjectKind: 'task', subjectRef: 'tk-m4', projectId: 'cp-marina', atISO: '2026-07-24', by: 'Emeka Nwosu', impactDays: 4 },
  { tenantId: A, id: 're-2', domain: 'delay', codeId: 'rc-d1', subjectKind: 'task', subjectRef: 'tk-m3', projectId: 'cp-marina', atISO: '2026-07-20', by: 'Emeka Nwosu', impactDays: 3 },
  { tenantId: A, id: 're-3', domain: 'delay', codeId: 'rc-d1', subjectKind: 'report', subjectRef: '2026-07-18', projectId: 'cp-marina', atISO: '2026-07-18', by: 'Chike Obi', impactDays: 2 },
  { tenantId: A, id: 're-4', domain: 'delay', codeId: 'rc-d3', subjectKind: 'task', subjectRef: 'tk-m4', projectId: 'cp-marina', atISO: '2026-07-22', by: 'Ngozi Okafor', impactDays: 5 },
  { tenantId: A, id: 're-5', domain: 'delay', codeId: 'rc-d3', subjectKind: 'task', subjectRef: 'tk-m6', projectId: 'cp-marina', atISO: '2026-07-16', by: 'Ngozi Okafor', impactDays: 2 },
  { tenantId: A, id: 're-6', domain: 'delay', codeId: 'rc-d2', subjectKind: 'report', subjectRef: '2026-07-15', projectId: 'cp-marina', atISO: '2026-07-15', by: 'Chike Obi', impactDays: 1 },
  { tenantId: A, id: 're-7', domain: 'delay', codeId: 'rc-d5', subjectKind: 'report', subjectRef: '2026-07-11', projectId: 'cp-marina', atISO: '2026-07-11', by: 'Emeka Nwosu', impactDays: 1 },
  { tenantId: A, id: 're-8', domain: 'rejection', codeId: 'rc-r1', subjectKind: 'purchase_request', subjectRef: 'PR-4025', projectId: 'cp-marina', atISO: '2026-07-23', by: 'Ngozi Okafor', impactMinor: 12_000_000_000 },
  { tenantId: A, id: 're-9', domain: 'rejection', codeId: 'rc-r3', subjectKind: 'timesheet', subjectRef: 'TS-0309', projectId: 'cp-marina', atISO: '2026-07-08', by: 'Ngozi Okafor', impactMinor: 18_000_000 },
  { tenantId: A, id: 're-10', domain: 'rejection', codeId: 'rc-r1', subjectKind: 'purchase_request', subjectRef: 'PR-4019', projectId: 'cp-marina', atISO: '2026-06-28', by: 'Ngozi Okafor', impactMinor: 4_500_000_000 },
  { tenantId: A, id: 're-11', domain: 'variance', codeId: 'rc-v1', subjectKind: 'cost_code', subjectRef: 'MAR-SUP', projectId: 'cp-marina', atISO: '2026-07-01', by: 'Ngozi Okafor', impactMinor: 68_000_000_000, note: 'Cement and rebar both moved after the FX shift' },
  { tenantId: A, id: 're-12', domain: 'variance', codeId: 'rc-v3', subjectKind: 'cost_code', subjectRef: 'MAR-SUB', projectId: 'cp-marina', atISO: '2026-05-30', by: 'Ngozi Okafor', impactMinor: 30_000_000_000, note: 'Pile cap rework after failed cube test' },
  { tenantId: A, id: 're-13', domain: 'stock_adjust', codeId: 'rc-s1', subjectKind: 'material', subjectRef: 'mat-cement', projectId: 'cp-marina', atISO: '2026-07-19', by: 'Chike Obi', impactMinor: 480_000_00 },
] as unknown) as ReasonEvent[];

/* --- approval workflow ----------------------------------------------------- */

/** Three routes for purchase requests, escalating with value — the classic
 *  delegated-authority ladder. The top route runs QS and Finance in PARALLEL. */
export const constructionApprovalRules = ([
  { tenantId: A, id: 'ar-pr-base', name: 'Purchase request — standard', subject: 'purchase_request', thresholdMinor: 0, active: true, steps: [
    { order: 1, role: 'facility_manager', label: 'Project manager', slaHours: 24 },
  ] },
  { tenantId: A, id: 'ar-pr-mid', name: 'Purchase request — above ₦10m', subject: 'purchase_request', thresholdMinor: 1_000_000_000, active: true, steps: [
    { order: 1, role: 'facility_manager', label: 'Project manager', slaHours: 24 },
    { order: 2, role: 'estate_manager', label: 'Quantity surveyor', slaHours: 48 },
  ] },
  { tenantId: A, id: 'ar-pr-high', name: 'Purchase request — above ₦50m', subject: 'purchase_request', thresholdMinor: 5_000_000_000, active: true, steps: [
    { order: 1, role: 'facility_manager', label: 'Project manager', slaHours: 24 },
    { order: 2, role: 'estate_manager', label: 'Quantity surveyor', slaHours: 48 },
    { order: 2, role: 'executive', label: 'Finance', slaHours: 48 },
    { order: 3, role: 'executive', label: 'Executive sign-off', slaHours: 72 },
  ] },
  { tenantId: A, id: 'ar-var', name: 'Variation — any value', subject: 'variation', thresholdMinor: 0, active: true, steps: [
    { order: 1, role: 'estate_manager', label: 'Quantity surveyor', slaHours: 48 },
    { order: 2, role: 'executive', label: 'Client approval', slaHours: 120 },
  ] },
  { tenantId: A, id: 'ar-adj', name: 'Stock adjustment', subject: 'stock_adjust', thresholdMinor: 0, active: true, steps: [
    { order: 1, role: 'estate_manager', label: 'Store manager review', slaHours: 24 },
  ] },
  { tenantId: A, id: 'ar-ovr', name: 'Budget override', subject: 'budget_override', thresholdMinor: 0, active: true, steps: [
    { order: 1, role: 'estate_manager', label: 'Quantity surveyor', slaHours: 24 },
    { order: 2, role: 'executive', label: 'Executive sign-off', slaHours: 48 },
  ] },
] as unknown) as ApprovalRule[];

/** One request mid-flight at a parallel step (QS in, Finance still out) and one
 *  sitting past its SLA — so the inbox and the escalation both have something real. */
export const constructionApprovals = ([
  { tenantId: A, id: 'apr-1', ref: 'APR-1041', subject: 'purchase_request', subjectRef: 'PR-4025', title: 'Tower crane extended hire (2 mo)', projectId: 'cp-marina', amountMinor: 12_000_000_000, raisedBy: 'Ngozi Okafor', raisedISO: '2026-07-22T09:00:00Z', ruleId: 'ar-pr-high', status: 'in_flight', steps: [
    { order: 1, role: 'facility_manager', label: 'Project manager', slaHours: 24, status: 'approved', actedBy: 'Bola Adeyemi', actedISO: '2026-07-22', comment: 'Crane needed to keep the L5 pour sequence' },
    { order: 2, role: 'estate_manager', label: 'Quantity surveyor', slaHours: 48, status: 'approved', actedBy: 'Ngozi Okafor', actedISO: '2026-07-23' },
    { order: 2, role: 'executive', label: 'Finance', slaHours: 48, status: 'pending' },
    { order: 3, role: 'executive', label: 'Executive sign-off', slaHours: 72, status: 'pending' },
  ] },
  { tenantId: A, id: 'apr-2', ref: 'APR-1044', subject: 'variation', subjectRef: 'VAR-018', title: 'Upgrade lobby finishes to client selection', projectId: 'cp-marina', amountMinor: 4_200_000_000, raisedBy: 'Emeka Nwosu', raisedISO: '2026-07-20T08:00:00Z', ruleId: 'ar-var', status: 'in_flight', reasonCodeId: 'rc-v2', note: 'Client selected a higher-grade stone at the L1 lobby', steps: [
    { order: 1, role: 'estate_manager', label: 'Quantity surveyor', slaHours: 48, status: 'pending' },
    { order: 2, role: 'executive', label: 'Client approval', slaHours: 120, status: 'pending' },
  ] },
  { tenantId: A, id: 'apr-3', ref: 'APR-1038', subject: 'purchase_request', subjectRef: 'PR-4021', title: 'Y16 reinforcement bar — 40 tonne', projectId: 'cp-marina', amountMinor: 5_200_000_000, raisedBy: 'Emeka Nwosu', raisedISO: '2026-07-14T10:00:00Z', ruleId: 'ar-pr-high', status: 'approved', steps: [
    { order: 1, role: 'facility_manager', label: 'Project manager', slaHours: 24, status: 'approved', actedBy: 'Bola Adeyemi', actedISO: '2026-07-14' },
    { order: 2, role: 'estate_manager', label: 'Quantity surveyor', slaHours: 48, status: 'approved', actedBy: 'Ngozi Okafor', actedISO: '2026-07-15' },
    { order: 2, role: 'executive', label: 'Finance', slaHours: 48, status: 'approved', actedBy: 'Chidi Okonkwo', actedISO: '2026-07-15' },
    { order: 3, role: 'executive', label: 'Executive sign-off', slaHours: 72, status: 'approved', actedBy: 'Chidi Okonkwo', actedISO: '2026-07-16' },
  ] },
] as unknown) as ApprovalRequest[];

/* --- audit trail (seeded history) ------------------------------------------ */

export const constructionAudit = ([
  { tenantId: A, id: 'au-1', seq: 1, atISO: '2026-07-16T11:20:00Z', actorId: 'user-executive', actorName: 'Chidi Okonkwo', actorRole: 'executive', action: 'approve', entity: 'approval', entityRef: 'APR-1038', projectId: 'cp-marina', summary: 'Executive sign-off on Y16 reinforcement bar', amountMinor: 5_200_000_000 },
  { tenantId: A, id: 'au-2', seq: 2, atISO: '2026-07-16T14:05:00Z', actorId: 'user-estate_manager', actorName: 'Ngozi Okafor', actorRole: 'estate_manager', action: 'issue', entity: 'purchase_order', entityRef: 'PO-3012', projectId: 'cp-marina', summary: 'PO issued to SteelForce Nigeria after award', amountMinor: 5_200_000_000 },
  { tenantId: A, id: 'au-3', seq: 3, atISO: '2026-07-19T09:40:00Z', actorId: 'user-estate_manager', actorName: 'Ngozi Okafor', actorRole: 'estate_manager', action: 'stock_move', entity: 'material', entityRef: 'mat-cement', projectId: 'cp-marina', summary: 'Adjustment −12 bags, damaged in storage', amountMinor: 480_000_00, reasonCodeId: 'rc-s1' },
  { tenantId: A, id: 'au-4', seq: 4, atISO: '2026-07-21T16:00:00Z', actorId: 'user-estate_manager', actorName: 'Ngozi Okafor', actorRole: 'estate_manager', action: 'post_cost', entity: 'timesheet', entityRef: 'TS-0318', projectId: 'cp-marina', summary: 'Labour posted to MAR-SUP', amountMinor: 1_181_250, before: '₦4,485,000', after: '₦4,486,181' },
  { tenantId: A, id: 'au-5', seq: 5, atISO: '2026-07-23T10:15:00Z', actorId: 'user-estate_manager', actorName: 'Ngozi Okafor', actorRole: 'estate_manager', action: 'reject', entity: 'purchase_request', entityRef: 'PR-4025', projectId: 'cp-marina', summary: 'Crane hire exceeds the remaining MAR-PRE budget', amountMinor: 12_000_000_000, reasonCodeId: 'rc-r1' },
  { tenantId: A, id: 'au-6', seq: 6, atISO: '2026-07-24T08:30:00Z', actorId: 'user-facility_manager', actorName: 'Bola Adeyemi', actorRole: 'facility_manager', action: 'override', entity: 'budget', entityRef: 'MAR-SUP', projectId: 'cp-marina', summary: 'Budget override authorised to keep the L4 pour on programme', amountMinor: 8_000_000_000, note: 'Executive verbal, confirmed in writing 24 Jul' },
] as unknown) as AuditEntry[];
