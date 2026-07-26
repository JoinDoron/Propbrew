import { requireCapability } from '@/server/guard';
import { effectiveLevel, CAPABILITIES, CAPABILITY_LABELS, MATRIX, ROLES, ROLE_LABELS, levelFor, type Level } from '@/lib/authz';
import { brand } from '@/config/brand';
import { Card, CardHeader } from '@/components/ui';
import { ReadOnlyChip } from '@/components/domain';

const LEVEL_LABEL: Record<Level, string> = { F: 'Full', M: 'Manage', V: 'View', O: 'Own', none: '—' };
const LEVEL_TONE: Record<Level, string> = {
  F: 'var(--tone-danger)',
  M: 'var(--tone-info)',
  V: 'var(--tone-neutral)',
  O: 'var(--tone-progress)',
  none: 'var(--text-3)',
};

/** SC-07 — settings: company profile, preferences, and the §7 permissions
 *  matrix rendered live from the authz layer (the same table the API enforces).
 *  Only Platform Admin has Full here; managers see it read-only. */
export default async function SettingsPage() {
  const { actor } = await requireCapability('tenant_config');
  const canManage = effectiveLevel(actor, 'tenant_config') === 'F';

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <Card>
        <CardHeader title="Organisation" subtitle="Branding and identity for this tenant" action={canManage ? undefined : <ReadOnlyChip />} />
        <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-4 mt-4">
          <Field label="Platform" value={brand.name} />
          <Field label="Client" value={brand.client} />
          <Field label="Primary colour" value={brand.primaryColor} swatch={brand.primaryColor} />
          <Field label="Default language" value="English (en)" />
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="Roles & permissions" subtitle="PRD §7 — the authoritative matrix, enforced server-side (SC-01)" />
        </div>
        <div className="w-full overflow-x-auto p-2">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="text-left font-semibold text-text-3 px-3 py-2 sticky left-0 bg-surface">Capability</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-2 py-2 text-center font-semibold text-text-3 whitespace-nowrap" title={ROLE_LABELS[r]}>
                    {ROLE_LABELS[r].split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap) => (
                <tr key={cap} className="hover:bg-surface-2">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-surface whitespace-nowrap">{CAPABILITY_LABELS[cap]}</td>
                  {ROLES.map((role) => {
                    const level = levelFor(role, cap);
                    return (
                      <td key={role} className="px-2 py-2 text-center">
                        <span
                          title={`${ROLE_LABELS[role]}: ${LEVEL_LABEL[level]}`}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold"
                          style={{ color: LEVEL_TONE[level], background: level === 'none' ? 'transparent' : `color-mix(in srgb, ${LEVEL_TONE[level]} 14%, transparent)` }}
                        >
                          {level === 'none' ? '·' : level}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 sm:px-[18px] pb-4 flex flex-wrap gap-3 text-[11.5px] text-text-3">
          {(['F', 'M', 'V', 'O'] as Level[]).map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className="font-bold" style={{ color: LEVEL_TONE[l] }}>{l}</span> {LEVEL_LABEL[l]}
            </span>
          ))}
        </div>
      </Card>

      <p className="text-[11px] text-text-3 text-center">
        {Object.keys(MATRIX).length} capabilities × {ROLES.length} roles · rendered from the same matrix the server enforces
      </p>
    </div>
  );
}

function Field({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-3 uppercase tracking-wide">{label}</div>
      <div className="text-[13.5px] font-medium mt-0.5 flex items-center gap-1.5">
        {swatch && <span className="w-3 h-3 rounded-full flex-none" style={{ background: swatch }} />}
        {value}
      </div>
    </div>
  );
}
