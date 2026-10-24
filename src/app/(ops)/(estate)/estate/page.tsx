import EstateHome from '@/components/workspaces/estate-home';
import { requireWorkspace } from '@/server/workspaces';

export default async function EstatePortalPage({ searchParams }: { searchParams: Promise<{ currency?: string | string[] }> }) {
  await requireWorkspace('estate');
  const selection = (await searchParams).currency;
  const currency = (['NGN', 'USD', 'GHS', 'KES'] as const).find((code) => code === selection) ?? 'NGN';
  return <EstateHome currency={currency} />;
}
