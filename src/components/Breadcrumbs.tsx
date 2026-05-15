import { Link } from "react-router-dom";
import styles from "./Breadcrumbs.module.css";

export type Crumb = { label: string; to?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className={styles.nav} aria-label="Breadcrumb">
      <ol className={styles.list}>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className={styles.item}>
            {i > 0 ? <span className={styles.sep} aria-hidden>/</span> : null}
            {c.to ? (
              <Link to={c.to} className={styles.link}>
                {c.label}
              </Link>
            ) : (
              <span className={styles.current}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
