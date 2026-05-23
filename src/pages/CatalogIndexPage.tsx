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
        Browse sneakers, apparel, and accessories by department. Each aisle is curated for how you shop.
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
    </div>
  );
}
