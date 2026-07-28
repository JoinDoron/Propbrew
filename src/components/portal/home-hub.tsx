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
    <div className="grid grid-cols-3 gap-2">
      {chips.map((c) => (
        <div key={c.key} className="rounded-xl border border-border bg-surface p-2.5">
          <div className="flex items-center gap-1.5 text-[10.5px] text-text-3 uppercase tracking-wide" style={{ color: toneVar(c.tone) }}>{STATUS_ICON[c.key]}{c.label}</div>
          <div className="text-[12.5px] font-semibold mt-0.5 truncate">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

export function AttentionList({ items }: { items: Attention[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('success')} 14%, transparent)`, color: toneVar('success') }}><CheckCircle2 size={18} /></span>
        <div><div className="text-[13.5px] font-semibold">You’re all set</div><div className="text-[12px] text-text-3">No charges, alerts or actions pending.</div></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => {
        const m = KIND_META[it.kind];
        return (
          <Link key={i} href={it.href} className="rounded-2xl border border-border bg-surface p-3.5 flex items-center gap-3 hover:bg-surface-2 transition-colors">
            <span className="w-9 h-9 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(m.tone)} 14%, transparent)`, color: toneVar(m.tone) }}>{m.icon}</span>
            <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold truncate">{it.title}</div><div className="text-[11.5px] text-text-3 truncate">{it.sub}</div></div>
            <span className="text-[11.5px] font-medium flex-none" style={{ color: toneVar(m.tone) }}>{it.cta}</span>
            <ChevronRight size={15} className="text-text-3 flex-none" />
          </Link>
        );
      })}
    </div>
  );
}

export function ActivityTimeline({ items }: { items: Activity[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2 mb-3"><Clock size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Recent activity</span></div>
      <div className="flex flex-col gap-2.5">
        {items.map((a, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-surface-2 grid place-items-center flex-none">{ACT_ICON[a.kind]}</span>
            <span className="text-[12.5px] text-text-2 flex-1 truncate">{a.text}</span>
            <span className="text-[11px] text-text-3 flex-none">{a.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
