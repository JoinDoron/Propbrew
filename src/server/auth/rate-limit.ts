import 'server-only';
import { createHmac } from 'node:crypto';
import { authDatabasePool } from './database';

/** Shared database counters cover HTTP endpoints and server-side auth calls. */
export async function consumeAuthAttempt(kind: string, subject: string, limit: number, seconds: number): Promise<void> {
  const key = `${kind}:${createHmac('sha256', process.env.BETTER_AUTH_SECRET!).update(subject).digest('hex')}`;
  const result = await authDatabasePool().query('insert into auth_action_limits(key,window_start,count) values($1,now(),1) on conflict(key) do update set count=case when auth_action_limits.window_start < now()-$2*interval \'1 second\' then 1 else auth_action_limits.count+1 end,window_start=case when auth_action_limits.window_start < now()-$2*interval \'1 second\' then now() else auth_action_limits.window_start end returning count', [key, seconds]);
  if (result.rows[0].count > limit) throw new Error('Too many attempts. Please try again later.');
}
