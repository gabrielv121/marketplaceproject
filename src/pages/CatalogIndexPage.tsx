import { Link } from "react-router-dom";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DEPARTMENTS } from "@/lib/catalog-taxonomy";
import styles from "./CatalogIndexPage.module.css";

export function CatalogIndexPage() {
  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Catalog" }]} />
      <h1 className={styles.h1}>Catalog</h1>
      <p className={styles.lead}>
        Shop by department — StockX-style aisles, filtered by tags or the{" "}
        <code className={styles.code}>department_slug</code> column in Supabase.
      </p>
      <ul className={styles.grid}>
        {DEPARTMENTS.map((d) => (
          <li key={d.slug}>
            <Link to={`/catalog/${d.slug}`} className={styles.tile}>
              <span className={styles.tileTitle}>{d.title}</span>
              <span className={styles.tileDesc}>{d.description}</span>
              <span className={styles.tileCta}>Browse →</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        Use tags <code className={styles.code}>dept-men</code>, <code className={styles.code}>dept-women</code>,{" "}
        <code className={styles.code}>dept-kids</code>, or <code className={styles.code}>dept-accessories</code> (or set{" "}
        <code className={styles.code}>department_slug</code> in the database) so products land in the right aisle.
      </p>
    </div>
  );
}
