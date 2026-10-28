import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, CircleAlert, Sparkles } from 'lucide-react';
import styles from './scoped-operating-hub.module.css';

export type ScopedHubMetric = { label: string; value: string; hint: string; tone?: 'good' | 'warn' | 'risk' };
export type ScopedHubTool = { label: string; description: string; href: string };
export type ScopedHubSection = { id: string; label: string; description: string; href: string; tools: ScopedHubTool[] };
export type ScopedHubRow = { primary: string; secondary: string; value: string; status: string; tone?: 'good' | 'warn' | 'risk' };

export function ScopedOperatingHub({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel,
  metrics,
  sections,
  rows,
  selectedSection,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref: string;
  backLabel: string;
  metrics: ScopedHubMetric[];
  sections: ScopedHubSection[];
  rows: ScopedHubRow[];
  selectedSection?: string;
}) {
  const active = selectedSection ? sections.find((section) => section.id === selectedSection) : undefined;
  return <div className={styles.page}>
    <Link href={backHref} className={styles.back}><ArrowLeft size={15} />{backLabel}</Link>
    <header className={styles.hero}>
      <div className={styles.identity}><span><Building2 size={23} /></span><div><p>{eyebrow}</p><h1>{title}</h1><small>{subtitle}</small></div></div>
      <div className={styles.scope}><Sparkles size={15} /><span>AI insights are advisory, permission-aware and grounded in this operating scope.</span></div>
    </header>

    <section className={styles.metrics} aria-label={`${title} summary`}>
      {metrics.map((metric) => <article key={metric.label} data-tone={metric.tone}><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.hint}</span></article>)}
    </section>

    {active ? <section className={styles.panel}>
      <header className={styles.panelHeader}><div><p>{eyebrow}</p><h2>{active.label}</h2><span>{active.description}</span></div><Link href={active.href}>Open primary workspace <ArrowRight size={15} /></Link></header>
      <div className={styles.toolGrid}>{active.tools.map((tool) => <Link key={tool.href} href={tool.href} className={styles.tool}><span><strong>{tool.label}</strong><small>{tool.description}</small></span><ArrowRight size={16} /></Link>)}</div>
    </section> : <>
      <section className={styles.sectionGrid} aria-label={`${title} operating areas`}>
        {sections.map((section) => <Link key={section.id} href={section.href} className={styles.sectionCard}><div><small>{section.tools.length} workflows</small><h2>{section.label}</h2><p>{section.description}</p></div><span>Open section <ArrowRight size={16} /></span></Link>)}
      </section>
      <section className={styles.panel}>
        <header className={styles.panelHeader}><div><p>Recorded operational picture</p><h2>Needs attention</h2><span>Live records in the current asset scope.</span></div><span className={styles.disclaimer}><CircleAlert size={14} />Verify evidence before action</span></header>
        <div className={styles.table} role="table" aria-label={`${title} attention records`}>
          {rows.map((row, index) => <div className={styles.row} role="row" key={`${row.primary}-${index}`}><div role="cell"><strong>{row.primary}</strong><small>{row.secondary}</small></div><span role="cell">{row.value}</span><em role="cell" data-tone={row.tone}>{row.status}</em></div>)}
          {!rows.length && <div className={styles.empty}>No attention records in this scope.</div>}
        </div>
      </section>
    </>}
  </div>;
}
