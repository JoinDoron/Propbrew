import { en, type StringKey } from './en';

/**
 * `t(key)` — the single translation entry point. Interpolates `{name}`-style
 * placeholders. Falls back to the key itself so a missing string is visible in
 * the UI rather than silently blank.
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const template: string = en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export type { StringKey };
