# Vesta

**Facility & Estate Management Platform** — a multi-tenant, AI-enabled platform
for running facilities, estates and residential communities end-to-end.

Built by Unrealabs (Choplife Technologies Ltd) for 7 Fifteen Capital.
Implements PRD v2.0.

This repository is the **web app + admin dashboard** (PRD requirement `SC-06`).
The mobile apps (`SC-05`) and the backend services are separate tracks.

## Getting started

```bash
npm run dev
```

Runs on <http://localhost:3005>.

```bash
npm run build     # production build
npm run lint      # eslint
npx tsc --noEmit  # typecheck
```

## What this platform is

Two functional modules on a shared, AI-enabled core:

| Module | Covers | Requirement IDs |
| --- | --- | --- |
| **Facility Management** | Assets, PPM, work orders, inspections, vendors, space, reporting | `FM-01`…`FM-08` |
| **Estate Management** | Billing, residents, requests, bookings, security, marketplace | `EM-01`…`EM-09` |
| **Shared core** | RBAC, payments, notifications, audit, multi-tenancy, investor dashboard | `SC-01`…`SC-11` |
| **AI layer** | Predictive maintenance, triage, copilots, doc intelligence | `AI-F-*`, `AI-E-*`, `AI-S-*` |

Nine roles — Platform Admin, Executive, Estate Manager, Facility Manager,
Technician, Resident, Security, Vendor, Investor — with deny-by-default,
server-enforced permissions (`SC-01`, PRD §7).

## Structure

```
src/
  app/          routes (App Router) + globals.css tokens
  components/   app-shell, theme-provider, ui primitives
  config/       brand.ts (name + colour), nav.ts (navigation)
```

See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) for tokens, components and theming.

## Status

Foundation stage. The design system is complete and verified. The domain model,
RBAC engine, workflow state machines and role-scoped routes are built against
PRD v2.0 Phase 1 (Must-priority) requirements.

Data is currently seeded in-repo behind a data layer designed to be swapped for
the real API without touching UI code.

## Notes

- Next.js in this project has breaking changes from older versions — see
  `AGENTS.md` and consult `node_modules/next/dist/docs/` before writing code.
- Icons come from `lucide-react`.
- Tenant isolation is release-blocking (`SC-07`, PRD §8.2): no query, file,
  search index, AI retrieval or report may cross tenants below Platform Admin.
