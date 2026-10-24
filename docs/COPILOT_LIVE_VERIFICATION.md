# Local Copilot activation — 24 October 2026

OpenAI was configured locally through a temporary loopback-only setup form. The key was saved in the ignored `.env.local` file with owner-only permissions; it was not read into chat or recorded in this report. The setup server closed after the successful save. Next.js confirmed that the changed environment was reloaded.

## Live provider and browser checks

The four operator Copilots returned actual OpenAI `gpt-6.1-sol` answers through their respective application endpoints. These checks used demonstration records and the Estate Manager persona, not customer production data. Answers and follow-ups completed with the model/source metadata and server-confirmed usage record.

| Module | Live factual check | Follow-up |
| --- | --- | --- |
| Estate | Lekki Gardens Estate; 26 July 2026 snapshot; 8 loaded invoices; NGN 720,000 total outstanding, including drafts | Preserved the same estate, date, count and amount in a one-sentence handover |
| Facility | Block C generator: 34% fuel, fault; Block D: 78%, standby; explicitly recorded values rather than live sensor evidence | Correctly prioritised review of Block C without claiming any action was taken |
| Shortlet | SL-4207: Unit 2B, 2–5 August 2026, NGN 0 outstanding, NGN 65,000 caution held; distinguished records from verified bank settlement | Preserved the reference, dates and amounts in a front-desk handover note |
| Construction | Two overdue incomplete deliveries: PO-3012, 0/40 tonnes, NGN 52m recorded order total; PO-3008, 800/1,200 bags, NGN 24m; totals not represented as payments | Correctly calculated 4 and 2 calendar days overdue against the 26 July snapshot |

The expected figures were independently checked against the actual context builders over the initialised demonstration store. Estate wallet reconciliation runs at store initialisation, so raw fixture balances alone are not the correct comparison.

## Interaction and access checks

- Expanded application activity showed access checks, scoped context preparation, model connection, answer completion and usage recording. No private model reasoning was displayed.
- A live Construction answer was stopped after text arrived. The partial text remained labelled incomplete, and no successful completion badge appeared on that attempt.
- Explicit Retry created a new attempt and completed the requested procurement checklist. The assistant distinguished recorded facts from recommendations and did not claim an operational mutation.
- The Facility usage view showed 4 completed cross-module requests and confirmed provider token totals at the initial checkpoint. Costs are application estimates using planning FX, not provider invoices. Later tests add further usage, including conservative accounting for unconfirmed interrupted attempts.
- Switching to the Executive demonstration persona redirected through `/workspaces` and cleared the previous conversation. A fresh Construction request withheld budgets and order totals for that role while correctly answering permitted delivery quantities. The original Estate Manager persona was restored afterwards.

## Rendering fix found during live testing

The first Facility response used a Markdown table that previously appeared as pipe-delimited text. The shared answer renderer now presents semantic native tables with labelled, contained horizontal scrolling, safe cell formatting and support for partial streamed rows. Adjacent paragraph/list blocks also render correctly. A subsequent live Construction response verified the native five-column table with the correct delivery quantities and NGN values. Generated HTML and arbitrary links remain inert; source links come from the server catalogue.

The new renderer passed 10 focused tests. The full suite passed **2,575 tests in 112 files**; lint and TypeScript checks passed. Mobile containment is covered by structural tests; the in-app browser viewport override did not consistently change this background tab's CSS viewport, so no additional device-size certification is claimed here.

## Scope and remaining production gates

This verifies the local application, its real provider connection, scoped demonstration context and response controls. It does not migrate or deploy the production environment. Production still requires its own encrypted key configuration, the durable database/migrations including 006, approved provider/data-region controls and resolution of the existing Next.js security advisory.

The operating snapshot remains 26 July 2026, not the current date. Some Facility observations are dated after that snapshot; their timing must be reconciled before treating the demonstration dataset as a consistent historical report. Live AI does not turn demonstration records into current bank, sensor, channel or emergency-dispatch evidence.
