# Propbrew platform interface system — Michael reference adaptation

## Reference and constraint

- Reference: `Dashboard by Michael`, Craftwork Inspiration `dashboard-by-michael-f2b9ca`.
- Source material: one static 3280 × 2448 image. The original post is a design showcase, not an inspectable product or video.
- Consequence: layout proportions can be measured; timing and easing cannot be recovered. Motion below deliberately reuses Propbrew's established interaction rhythm rather than claiming to reproduce undocumented source motion.
- License posture: reference only. Propbrew retains its own name, copy, records, icons, colours and information architecture.

## Measured composition

- Reference application origin: approximately 4.9% from the left and 6.5% from the top.
- Reference sidebar: approximately 28.8% of the full image width. Propbrew keeps its existing 248px responsive rail instead of copying this proportion.
- Reference content gutter: approximately 82px at native size, or 7.4% of the visible main canvas. Propbrew maps this to a 32px desktop gutter and 24/16/12px responsive gutters.
- Reference content structure: page heading; two equal analytics panels; full-width live-activity register.
- Reference panels: quiet one-pixel outlines, low/no elevation, soft label band, white body and generous radius.
- Reference register: three strong columns with 64–72px visual rows and semantic status chips.

## Propbrew component states

### Platform surface

- `loading`: existing page skeleton or progress treatment; controls disabled where required.
- `ready`: recorded, permission-scoped data is visible.
- `empty`: explicit empty state explains which workflow creates the first record.
- `error`: semantic danger treatment with a retry or source-workflow action when available.

### Interactive card or row

- `idle`: tokenised surface, border and text.
- `hover`: border/surface emphasis only; no layout movement.
- `focus-visible`: high-contrast focus ring with at least a 44px target.
- `pressed`: subtle scale/opacity feedback without moving surrounding layout.
- `active`: module-accent weak surface and semantic text/icon emphasis.
- `done`: existing success status treatment; status is always expressed in text as well as colour.

## Triggers and outcomes

- Page entrance runs once when a route renders.
- KPI cards remain informational unless the page already supports filtering. When interactive, activation filters the adjacent register and exposes `aria-pressed`.
- Activity/register rows open the existing source record or workflow; the design system does not invent new mutations.
- Existing module actions, permissions, tenant scope and AI confidence disclosures remain authoritative.
- Loading, empty and error transitions replace content in place and preserve headings/landmarks.

## Motion constants

- Page/panel entrance: `220ms`, `cubic-bezier(.4, 0, .2, 1)`.
- Sequential panel stagger: `40ms`.
- Hover/focus transition: `160ms`, standard easing.
- Press feedback: `90ms`, standard easing.
- Loading/ready/empty/error crossfade: `180ms`, standard easing.
- Motion properties: `transform`, `opacity` and `filter` only.
- `prefers-reduced-motion: reduce`: no entrance, stagger or press animation; the complete interface remains functional.

## Responsive contract

- 1440px and above: two analytics panels followed by the full-width register.
- 1024–1439px: two panels with tighter gutters; existing rail remains collapsible.
- 768–1023px: one analytics column; controls wrap without losing their labels.
- 360–767px: drawer navigation, 12–16px gutters, stacked panels, and register rows presented as semantic cards to prevent horizontal scrolling.
- Charts include textual values and accessible summaries; status never relies on colour alone.

## Global application

- Shell: preserve Propbrew's header, restored single straight guide rail, module navigation and module accents.
- Foundations: apply the panel, control, status and register language through shared tokens and primitives so admin and operational pages inherit it.
- Module homes: Estate, Facility, Shortlet and Construction use domain-specific data inside the shared overview/analytics/register composition.
- Operational pages: forms, approvals, registers, detail views and AI workspaces keep their workflows while inheriting the same surfaces, hierarchy and interaction states.
