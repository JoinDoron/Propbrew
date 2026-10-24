import { redirect } from 'next/navigation';
import { requireOperatorSession } from '@/server/workspaces';
import { withDurableRead } from '@/server/data/durable-records';

/** Compatibility entry: the combined dashboard is now the module chooser. */
export default async function DashboardPage() {
  return withDurableRead(async () => {
  await requireOperatorSession();
  redirect('/workspaces');
  });
}
