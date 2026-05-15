import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./HomeSection.module.css";

type Props = {
  id?: string;
  title: string;
  subtitle?: string;
  action?: { label: string; to: string };
  /** Optional tooltip for the small “i” control */
  titleInfo?: string;
  /** StockX-like dense header + optional plate behind content */
  variant?: "default" | "market";
  children: ReactNode;
};

export function HomeSection({ id, title, subtitle, action, titleInfo, variant = "default", children }: Props) {
  const isMarket = variant === "market";

  return (
    <section id={id} className={`${styles.section} ${isMarket ? styles.sectionMarket : ""}`}>
      <div className={styles.head}>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <h2 className={isMarket ? styles.titleMarket : styles.title}>{title}</h2>
            {titleInfo ? (
              <span className={styles.infoWrap}>
                <button type="button" className={styles.infoBtn} title={titleInfo} aria-label="About this section">
                  i
                </button>
              </span>
            ) : null}
          </div>
          {subtitle ? <p className={isMarket ? styles.subMarket : styles.sub}>{subtitle}</p> : null}
        </div>
        {action ? (
          <Link to={action.to} className={isMarket ? styles.actionMarket : styles.action}>
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className={isMarket ? styles.plate : styles.body}>{children}</div>
    </section>
  );
}
