import { requireCapability } from '@/server/guard';
import { seed } from '@/server/data';
import { brand } from '@/config/brand';
import { Card, CardHeader, Avatar } from '@/components/ui';
import { QrCode, ShieldCheck } from 'lucide-react';

/** Profile & IDs (resident-home PRD tile) — the resident's identity and a
 *  digital ID card for their unit(s), verifiable at the gate. */
export default async function ProfilePage() {
  const { actor } = await requireCapability('work_orders');
  const units = actor.unitIds.map((id) => seed.units.find((u) => u.id === id)).filter(Boolean);
  const name = 'Folake Bello';
  const residentId = 'RES-014-2291';

  return (
    <div className="max-w-[560px] mx-auto flex flex-col gap-4">
      {/* Digital ID card */}
      <div className="rounded-[20px] p-5 text-white shadow-float" style={{ backgroundImage: 'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, #000))' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/80">{brand.name} · Resident ID</span>
          <ShieldCheck size={18} className="text-white/90" />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <Avatar name={name} size={48} />
          <div>
            <div className="text-[16px] font-bold">{name}</div>
            <div className="font-mono text-[12px] text-white/80">{residentId}</div>
          </div>
          <span className="ml-auto w-14 h-14 rounded-xl bg-white/90 text-primary grid place-items-center flex-none">
            <QrCode size={34} />
          </span>
        </div>
        <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
          <span className="text-white/70">Estate <span className="text-white font-medium">Lekki Gardens</span></span>
          <span className="text-white/70">Units <span className="text-white font-medium">{units.map((u) => u!.label.split('·')[1]?.trim() ?? u!.label).join(', ')}</span></span>
          <span className="text-white/70">Status <span className="text-white font-medium">Verified</span></span>
        </div>
      </div>

      <Card>
        <CardHeader title="Profile" subtitle="Your details on file with the estate" />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="Full name" value={name} />
          <Field label="Resident ID" value={residentId} />
          <Field label="Email" value="folake@gmail.com" />
          <Field label="Phone" value="+234 802 555 0142" />
          <Field label="Household" value="4 members" />
          <Field label="Move-in" value="Mar 2024" />
        </div>
      </Card>

      <Card>
        <CardHeader title="My units" subtitle="Spaces linked to your account" />
        <div className="flex flex-col gap-2 mt-3">
          {units.map((u) => (
            <div key={u!.id} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
              <div>
                <div className="text-[13px] font-medium">{u!.label}</div>
                <div className="text-[11.5px] text-text-3">{u!.type}</div>
              </div>
              <span className="text-[11px] font-semibold text-[color:var(--tone-success)]">Active</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-3 uppercase tracking-wide">{label}</div>
      <div className="text-[13.5px] font-medium mt-0.5">{value}</div>
    </div>
  );
}
