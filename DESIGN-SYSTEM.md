# Cargoflow design system

Extracted from the [Cargoflow TMS HTML template](https://pbdh7766-cpu.github.io/Logistics-Management-Dashboard-HTML-Template/)
and rebuilt as real React components on Next.js 16 + Tailwind v4.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/config/brand.ts` | Company name, tagline, primary colour. **Re-brand here.** |
| `src/config/nav.ts` | Sidebar groups/items and per-route page titles. |
| `src/app/globals.css` | Design tokens, Tailwind theme mapping, keyframes. |
| `src/components/app-shell.tsx` | Sidebar + header + mobile drawer. |
| `src/components/theme-provider.tsx` | Light/dark, persisted, no flash. |
| `src/components/ui/index.tsx` | Component primitives. |
| `src/app/page.tsx` | Living style guide — replace with the real dashboard. |

## Tokens

Every colour resolves through a CSS variable, so light and dark stay in lockstep.
`[data-theme="dark"]` on `<html>` flips the whole system.

| Token | Light | Dark | Tailwind utility |
| --- | --- | --- | --- |
| `--app` | `#f4f5f7` | `#0e0f18` | `bg-app` |
| `--surface` | `#ffffff` | `#171826` | `bg-surface` |
| `--surface-2` | `#f7f7f9` | `#1d1f30` | `bg-surface-2` |
| `--surface-3` | `#f0f0f3` | `#242741` | `bg-surface-3` |
| `--border` | `#ececef` | `#2a2c42` | `border-border` |
| `--border-2` | `#e2e2e7` | `#333653` | `border-border-2` |
| `--text` | `#16182a` | `#eef0f6` | `text-text` |
| `--text-2` | `#5f636b` | `#a3acb9` | `text-text-2` |
| `--text-3` | `#9aa1ad` | `#6b7180` | `text-text-3` |
| `--primary` | `#2563eb` | `#5b8def` | `text-primary` / `bg-primary` |
| `--primary-weak` | 10% primary | 14% primary | `bg-primary-weak` |

Elevation: `shadow-card` (resting) and `shadow-float` (modals, drawers).

### Status scale

Load lifecycle colours, exposed as `STATUS_COLORS` and rendered by `<StatusPill>`:

`Draft` `#8b93a1` · `Posted` `#3b82f6` · `Booked` `#8b5cf6` ·
`In Transit` `#f59e0b` · `Delivered` `#10b981` · `Closed` `#6b7280`

Semantic: `--color-positive` `#10b981`, `--color-negative` `#ef4444`, `--color-warning` `#f59e0b`.

## Type

- **Inter Tight** (400/500/600/700) — all UI. Headings use `tracking-[-0.02em]`.
- **JetBrains Mono** (400/500) — refs, VINs, plates, money. Use `<Mono>`.

Scale: display 26/700 · heading 18/600 · body 14/400 · secondary 13/400 ·
label 11/600 uppercase `tracking-[0.06em]`.

## Shape & motion

- Cards `rounded-[16px]`, controls `rounded-[10px]`, chips/buttons `rounded-[11px]`.
- Controls are `38px` tall; header and sidebar brand row are `64px`.
- Transitions are fast — `120–150ms`. Buttons lift on hover, press down `1px`.
- Animations: `animate-fade`, `animate-pop`, `animate-slidein`, `animate-slideup`.
  All collapse automatically under `prefers-reduced-motion`.

## Breakpoints

Carried over from the template:

| Width | Behaviour |
| --- | --- |
| `≤1120px` | KPI grid → 2 columns, dashboard grid → 1 column |
| `≤880px` | Sidebar becomes a fixed off-canvas drawer; hamburger appears; header subtitle hides |
| `≤560px` | KPI grid → 1 column; profile button and chat hide |

## Components

```tsx
import {
  Card, CardHeader, KpiCard, StatusPill, Button, IconButton,
  FilterChip, Tabs, Table, Th, Td, TableRow, Avatar, Mono, EmptyState,
} from '@/components/ui';
```

- **`<Card>` / `<CardHeader>`** — the surface everything sits on. `padded={false}` for tables/tabs.
- **`<KpiCard>`** — metric tile with icon chip and up/down delta badge.
- **`<StatusPill>`** — dot + label, auto-coloured from the status scale.
- **`<Button>`** — `primary` | `secondary` | `ghost`. **`<IconButton>`** — 38px square.
- **`<FilterChip>`** — pill filter with optional count.
- **`<Tabs>`** — underline tabs, generic over the id union.
- **`<Table>` / `<Th>` / `<Td>` / `<TableRow>`** — pass `onClick` to `TableRow` for row links.
- **`<Avatar>`** — initials on the template's warm gradient.
- **`<Mono>`** — tabular monospace for identifiers and money.
- **`<EmptyState>`** — icon + title + description + action.

## Re-branding

Change `src/config/brand.ts` for the name, then update `--primary`,
`--primary-weak`, `--primary-weak-2` in `globals.css` (both themes).
`PRIMARY_PRESETS` holds the template's five original options.

## Theming

`themeInitScript` runs before paint, so there is no flash of the wrong theme.
The `data-theme` attribute on `<html>` is the source of truth; `useTheme()`
reads it via `useSyncExternalStore` and syncs across tabs.

```tsx
const { theme, toggleTheme, setTheme } = useTheme();
```

## What was deliberately not carried over

The original is a mock-data prototype in a proprietary `.dc` compiler format.
Its screens (loads, fleet map, fuel, RBAC matrix, chat) were **not** ported —
the PRD defines what actually gets built. What carried over is the visual
language: tokens, type, shape, motion, layout and component vocabulary.
