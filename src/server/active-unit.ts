import 'server-only';

/**
 * Active-unit context (read side). Kept OUT of the 'use server' action file
 * because that file may export only async functions — a constant or a plain
 * read helper there breaks every export. Server components import from here.
 *
 * The cookie is never trusted blindly: the resolved unit must be one of the
 * actor's own unitIds (§8.2 / §7 O), or we fall back to their first unit.
 */

import { cookies } from 'next/headers';

export const ACTIVE_UNIT_COOKIE = 'vesta_active_unit';

export async function getActiveUnitId(unitIds: readonly string[]): Promise<string | null> {
  if (unitIds.length === 0) return null;
  const store = await cookies();
  const wanted = store.get(ACTIVE_UNIT_COOKIE)?.value;
  return wanted && unitIds.includes(wanted) ? wanted : unitIds[0];
}
