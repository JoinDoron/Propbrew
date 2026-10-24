export function log(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, message, at: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line); else console.log(line);
}
