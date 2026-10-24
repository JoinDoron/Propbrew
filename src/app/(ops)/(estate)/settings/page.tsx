import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { CAPABILITIES, CAPABILITY_LABELS, MATRIX, ROLES, ROLE_LABELS, levelFor, type Level } from '@/lib/authz';
import { brand } from '@/config/brand';
import { Card, CardHeader, StatusPill } from '@/components/ui';
import { ReadOnlyChip, ScopeBanner } from '@/components/domain';
import { Info, ShieldCheck } from 'lucide-react';
import styles from '@/components/ui/workspace-layout.module.css';
import local from '@/components/estate/settings-reference.module.css';

const LEVEL_LABEL: Record<Level, string> = { F: 'Full', M: 'Manage', V: 'View', O: 'Own records', none: 'No access' };
const LEVEL_TONE: Record<Level, string> = { F: 'var(--tone-danger)', M: 'var(--tone-info)', V: 'var(--tone-neutral)', O: 'var(--tone-progress)', none: 'var(--text-3)' };

export default async function SettingsPage() {
  const { actor } = await requireCapability('tenant_config', 'read', 'estate');
  return <div className="pb-page">
    <PageHeader title="Settings" subtitle="Organisation identity and the policies behind your workspace."
      scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />} />
    <PageTabs label="Settings sections" items={[
      { id: 'organisation', label: 'Organisation', content: <div className={styles.layout}>
        <Card className={styles.panel}><CardHeader title="Organisation profile" subtitle="The identity currently configured for this product" action={<ReadOnlyChip />} />
          <dl className={local.profile}>
            <Field label="Platform" value={brand.name} /><Field label="Client" value={brand.client} />
            <Field label="Primary colour" value={brand.primaryColor} swatch={brand.primaryColor} /><Field label="Default language" value="English (en)" />
          </dl>
          <p className={styles.footnote}>This is a configuration reference. Organisation editing and preference persistence are not connected in this view.</p>
        </Card>
        <Card className={styles.panel}><CardHeader title="Workspace policy" subtitle="Clear boundaries for everyday operations" action={<ShieldCheck size={18} className="text-primary" />} />
          <dl className={styles.facts}><div><dt>Access model</dt><dd>Capability and record scope</dd></div><div><dt>Role combinations</dt><dd>Combined grants, within authorised scope</dd></div><div><dt>AI assistance</dt><dd>Human review before consequential actions</dd></div></dl>
          <p className={styles.footnote}>Role visibility does not replace server-side checks. Changing permissions requires an authorised administration workflow.</p>
        </Card>
      </div> },
      { id: 'permissions', label: 'Roles & permissions', content: <div className={styles.layout}>
        <Card padded={false} className={styles.panel}>
          <div className={styles.registerHeader}><CardHeader title="Roles & permissions" subtitle="The capability policy used by the authorisation layer" action={<StatusPill status="Policy reference" tone="info" />} /><div className={styles.filters}>{(['F', 'M', 'V', 'O', 'none'] as Level[]).map((level) => <span key={level} className={local.legend}><span style={{ color: LEVEL_TONE[level] }}>{level === 'none' ? '—' : level}</span>{LEVEL_LABEL[level]}</span>)}</div></div>
          <div className="pb-table-scroll" role="region" aria-label="Role capability matrix" tabIndex={0}>
            <table className={`pb-data-table ${local.permissionTable}`}><thead><tr><th scope="col">Capability</th>{ROLES.map((role) => <th scope="col" key={role}>{ROLE_LABELS[role]}</th>)}</tr></thead><tbody>{CAPABILITIES.map((capability) => <tr key={capability}><th scope="row">{CAPABILITY_LABELS[capability]}</th>{ROLES.map((role) => {
              const level = levelFor(role, capability);
              return <td key={role}><span className={local.level} title={`${ROLE_LABELS[role]}: ${LEVEL_LABEL[level]}`} aria-label={`${ROLE_LABELS[role]}: ${LEVEL_LABEL[level]}`} style={{ color: LEVEL_TONE[level], background: level === 'none' ? 'transparent' : `color-mix(in srgb, ${LEVEL_TONE[level]} 8%, var(--surface))` }}>{level === 'none' ? '—' : level}</span></td>;
            })}</tr>)}</tbody></table>
          </div>
          <p className={styles.registerFooter}>{Object.keys(MATRIX).length} capabilities × {ROLES.length} roles · This reference does not edit access or grant permissions.</p>
        </Card>
        <div className={styles.notice}><Info size={18} aria-hidden="true" /><p>Scope still applies within a permission.<span>“Own records” is not unrestricted access. The server must check tenant, estate and ownership rules for each request.</span></p></div>
      </div> },
    ]} />
  </div>;
}

function Field({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return <div><dt>{label}</dt><dd>{swatch && <span className={local.swatch} style={{ background: swatch }} aria-hidden="true" />}{value}</dd></div>;
}
