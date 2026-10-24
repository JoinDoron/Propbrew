
import { Card, CardHeader, EmptyState } from '@/components/ui';
import layout from '@/components/ui/workspace-layout.module.css';
import Link from 'next/link';
import { Zap, Droplet, Shield, ChevronRight, LifeBuoy, Receipt, CalendarCheck, Wrench, ShoppingBag, Megaphone, CheckCircle2, Clock } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type StatusChip = { key: string; label: string; value: string; tone: Tone };
export type Attention = { kind: 'sos' | 'bill' | 'booking' | 'request' | 'order' | 'announce'; title: string; sub: string; href: string; cta: string };
export type Activity = { kind: 'payment' | 'request' | 'booking' | 'order'; text: string; when: string };

const KIND_META: Record<Attention['kind'], { icon: React.ReactNode; tone: Tone }> = {
  sos: { icon: <LifeBuoy size={16} />, tone: 'danger' },
  bill: { icon: <Receipt size={16} />, tone: 'warn' },
  booking: { icon: <CalendarCheck size={16} />, tone: 'progress' },
  request: { icon: <Wrench size={16} />, tone: 'info' },
  order: { icon: <ShoppingBag size={16} />, tone: 'success' },
  announce: { icon: <Megaphone size={16} />, tone: 'info' },
};

const ACT_ICON: Record<Activity['kind'], React.ReactNode> = {
  payment: <CheckCircle2 size={13} className="text-positive" />,
  request: <Wrench size={13} className="text-primary" />,
  booking: <CalendarCheck size={13} className="text-primary" />,
  order: <ShoppingBag size={13} className="text-positive" />,
};

const STATUS_ICON: Record<string, React.ReactNode> = { power: <Zap size={13} />, water: <Droplet size={13} />, security: <Shield size={13} /> };

export function EstateStatus({ chips }: { chips: StatusChip[] }) {
  return (
    <div className={layout.grid}>
      {chips.map((c) => (
        <Card key={c.key}><div className="flex items-center gap-2 text-[12px] text-text-3" style={{ color: toneVar(c.tone) }}>{STATUS_ICON[c.key]}{c.label}</div><div className="text-[16px] font-medium mt-3">{c.value}</div><p className="text-[12px] text-text-3 mt-2">Recorded notices only · not live service status</p></Card>
      ))}
    </div>
  );
}

export function AttentionList({ items }: { items: Attention[] }) {
  if (items.length === 0) {
    return (
      <Card><EmptyState icon={<CheckCircle2 size={24} />} title="Nothing listed in this snapshot" description="No attention items were returned for the current unit and account. This is not a live safety or account-clearance confirmation." /></Card>
    );
  }
  return (
    <div className={layout.layout}>
      {items.map((it, i) => {
        const m = KIND_META[it.kind];
        return (
          <Card key={i} padded={false}><Link href={it.href} className="p-6 max-[640px]:p-4 flex items-center gap-4 hover:bg-surface-2 transition-colors">
            <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(m.tone)} 14%, transparent)`, color: toneVar(m.tone) }}>{m.icon}</span>
            <div className="min-w-0 flex-1"><div className="text-[14px] font-medium break-words">{it.title}</div><div className="text-[14px] text-text-3 break-words mt-1">{it.sub}</div></div>
            <span className="text-[12px] font-medium flex-none" style={{ color: toneVar(m.tone) }}>{it.cta}</span>
            <ChevronRight size={15} className="text-text-3 flex-none" />
          </Link></Card>
        );
      })}
    </div>
  );
}

export function ActivityTimeline({ items }: { items: Activity[] }) {
  if (items.length === 0) return <Card><EmptyState icon={<Clock size={24} />} title="No activity records" description="Recorded account activity will appear here when available." /></Card>;
  return (
    <Card>
      <CardHeader title="Recorded activity" subtitle="Dates reflect recorded request creation, booking slots, order placement and invoice due dates—not payment verification times" />
      <div className="flex flex-col gap-6 min-w-0">
        {items.map((a, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-surface-2 grid place-items-center flex-none">{ACT_ICON[a.kind]}</span>
            <span className="text-[14px] text-text-2 flex-1 truncate">{a.text}</span>
            <span className="text-[12px] text-text-3 flex-none">{a.when}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
