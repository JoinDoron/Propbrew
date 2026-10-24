/** Roving focus order for a horizontal, automatically activated tab list. */
export function nextPageTab(ids: readonly string[], current: string, key: string): string | null {
  if (!ids.length) return null;
  const index = Math.max(0, ids.indexOf(current));
  switch (key) {
    case 'ArrowRight': return ids[(index + 1) % ids.length];
    case 'ArrowLeft': return ids[(index - 1 + ids.length) % ids.length];
    case 'Home': return ids[0];
    case 'End': return ids[ids.length - 1];
    default: return null;
  }
}
