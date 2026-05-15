import { useEffect, useState } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogFilters } from "@/components/CatalogFilters";
import { ProductGrid } from "@/components/ProductGrid";
import { loadCatalogProducts } from "@/lib/catalog-products";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import styles from "./CategoryCatalogPage.module.css";

export function NewArrivalsPage() {
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { products: list, error: err } = await loadCatalogProducts({ sortNew: true });
      if (!cancelled) {
        setProducts(list);
        setError(err);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "New arrivals" }]} />
      <header className={styles.header}>
        <h1 className={styles.h1}>New arrivals</h1>
        <p className={styles.lead}>Recently updated rows from Supabase, or reversed local seed order.</p>
      </header>
      {error ? (
        <p className={styles.warn} role="status">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <CatalogFilters products={products}>
          {(filtered) => <ProductGrid products={filtered} emptyMessage="No products match those filters." />}
        </CatalogFilters>
      )}
    </div>
  );
}
