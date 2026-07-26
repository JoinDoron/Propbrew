# Cargoflow

Next.js 16 + React 19 + Tailwind v4 application scaffold, themed with the
Cargoflow design system.

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

## Status

Scaffold stage. The design system is extracted and verified; the product
itself is not built yet — routes under `/loads`, `/maintenance`, `/carriers`,
`/fuel`, `/customers`, `/staff` and `/settings` are placeholders waiting on
the PRD.

`/` currently renders a living style guide of every primitive in both themes.

## Structure

```
src/
  app/          routes (App Router) + globals.css tokens
  components/   app-shell, theme-provider, ui primitives
  config/       brand.ts (name + colour), nav.ts (sidebar + titles)
```

See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) for tokens, components and
re-branding instructions.

## Notes

- Next.js in this project has breaking changes from older versions — see
  `AGENTS.md` and consult `node_modules/next/dist/docs/` before writing code.
- Icons come from `lucide-react`.
