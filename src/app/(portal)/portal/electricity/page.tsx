import { PageHeader } from '@/components/ui/page-header';
import { PageTabs } from '@/components/ui/page-tabs';
import { requireCapability } from '@/server/guard';
import { getActiveUnitId } from '@/server/active-unit';
import { seed } from '@/server/data';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PlugZap, ReceiptText, Zap } from 'lucide-react';
import { portalMoney } from '@/components/portal/portal-patterns';
import layout from '@/components/ui/workspace-layout.module.css';

export default async function ElectricityPage() {
  const { actor } = await requireCapability('charges_invoicing');
  const activeUnitId = await getActiveUnitId(actor.unitIds);
  const unit = seed.units.find((record) => record.id === activeUnitId && record.tenantId === actor.tenantId && actor.unitIds.includes(record.id));

  return <div className="pb-page">
    <PageHeader title="Electricity" subtitle="Prepaid power for your selected unit, with clear provider and payment status." />
    <PageTabs label="Electricity sections" items={[
      { id: 'power', label: 'Meter & top-up', content: <div className={layout.analytics}>
        <Card><CardHeader title={unit ? 'Meter · ' + unit.label : 'No authorised unit selected'} subtitle="Only provider-confirmed information will appear here" action={<Zap size={22} className="text-primary" aria-hidden="true" />} /><StatusPill status="Provider not connected" tone="warn" /><dl className={layout.facts + ' mt-6'}><div><dt>Meter number</dt><dd>Not connected</dd></div><div><dt>Energy balance</dt><dd>Unavailable</dd></div><div><dt>Current tariff</dt><dd>Not verified</dd></div><div><dt>Token vending</dt><dd>Not activated</dd></div></dl><p className={layout.footnote}>No sample meter number or balance has been substituted. Contact your estate’s approved electricity supplier for a verified meter reading, tariff or urgent power issue.</p></Card>
        <Card><CardHeader title="Top-up options" subtitle="Preview only · purchase and token vending are unavailable" /><div className="grid grid-cols-2 gap-4">{[2000, 5000, 10000, 20000].map((amount) => <Button key={amount} disabled title="Electricity vending is not connected">{portalMoney(amount * 100)}</Button>)}</div><Button variant="primary" disabled className="w-full mt-6" icon={<PlugZap size={18} />}>Buy power · unavailable</Button><p className={layout.footnote}>No bank account or wallet will be charged. Payment verification, provider vending and token delivery must be connected before purchases are enabled.</p></Card>
      </div> },
      { id: 'history', label: 'Purchase history', content: <Card><CardHeader title="Purchase history" subtitle="Verified electricity purchases and tokens only" /><EmptyState icon={<ReceiptText size={26} />} title="No connected purchase history" description="No provider-confirmed electricity purchases are available. Sample tokens are not valid payment or vending evidence." /></Card> },
    ]} />
  </div>;
}
