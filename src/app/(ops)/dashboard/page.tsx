import { redirect } from 'next/navigation';
import { requireOperatorSession } from '@/server/workspaces';

/** Compatibility entry: the combined dashboard is now the module chooser. */
export default async function DashboardPage() {
  await requireOperatorSession();
  redirect('/workspaces');
}
