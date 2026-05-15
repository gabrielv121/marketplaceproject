import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { loadCatalogBrands } from "@/lib/catalog-products";
import styles from "./BrandsPage.module.css";

export function BrandsPage() {
  const [brands, setBrands] = useState<{ name: string; slug: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { brands } = await loadCatalogBrands();
      if (!cancelled) {
        setBrands(brands);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Brands" }]} />
      <header className={styles.header}>
        <h1 className={styles.h1}>Brands</h1>
        <p className={styles.lead}>Shop by maker. Set the <code className={styles.code}>brand</code> field on catalog rows to populate this list.</p>
      </header>
      {loading ? (
        <p className={styles.muted}>Loading…</p>
      ) : brands.length ? (
        <ul className={styles.grid}>
          {brands.map((b) => (
            <li key={b.slug}>
              <Link to={`/brands/${b.slug}`} className={styles.card}>
                <span className={styles.name}>{b.name}</span>
                <span className={styles.count}>{b.count} items</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No brands yet — add a <code className={styles.code}>brand</code> value on your products.</p>
      )}
    </div>
  );
}
