import type { ReactNode } from 'react';
import styles from './page-header.module.css';

/** Shared page framing; panel titles remain CardHeader components. */
export function PageHeader({ title, subtitle, actions, scope }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  scope?: ReactNode;
}) {
  return (
    <header className={styles.header} data-page-header="true">
      <div className={styles.copy}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {scope ? <div className={styles.scope}>{scope}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
