import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('expired demo sandbox rotation migration', () => {
  const sql = readFileSync(resolve('db/migrations/016_demo_sandbox_rotation.sql'), 'utf8');

  it('detaches an expired sandbox and creates a fresh workspace for the valid session', () => {
    expect(sql).toContain('v_existing.expires_at>now()');
    expect(sql).toContain('set auth_session_id=null');
    expect(sql).toContain('insert into public.demo_sandboxes');
    expect(sql).not.toContain("raise exception 'The demo sandbox expired'");
  });

  it('preserves the verified session and source-only payload guards', () => {
    expect(sql).toContain('s."expiresAt">now()');
    expect(sql).toContain('public.propbrew_is_demo_user');
    expect(sql).toContain('public.demo_payload_valid(p_state,p_id)');
  });
});
