import { log } from '@/lib/logger';
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    log('info', 'reeve_runtime_started', { version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local' });
    const { startEstateRecurringWorker } = await import('@/server/jobs/estate-recurring');
    startEstateRecurringWorker();
  }
}
