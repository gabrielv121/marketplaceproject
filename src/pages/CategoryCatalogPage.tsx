import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogFilters } from "@/components/CatalogFilters";
import { ProductGrid } from "@/components/ProductGrid";
import { getDepartmentBySlug } from "@/lib/catalog-taxonomy";
import { loadCatalogProducts } from "@/lib/catalog-products";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import styles from "./CategoryCatalogPage.module.css";

export function CategoryCatalogPage() {
  const { departmentSlug = "" } = useParams();
  const dept = getDepartmentBySlug(departmentSlug);
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dept) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { products: list, error: err } = await loadCatalogProducts({ departmentSlug: dept.slug });
      if (!cancelled) {
        setProducts(list);
        setError(err);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dept]);

  if (!dept) {
    return (
      <div>
        <h1 className={styles.h1}>Department not found</h1>
        <p className={styles.muted}>
          <BackButton fallback="/catalog">Back</BackButton>
        </p>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Catalog", to: "/catalog" },
          { label: dept.title },
        ]}
      />
      <header className={styles.header}>
        <h1 className={styles.h1}>{dept.title}</h1>
        <p className={styles.lead}>{dept.description}</p>
      </header>
      {error ? (
        <p className={styles.warn} role="status">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <CatalogFilters key={dept.slug} products={products} hideWithoutProductPhoto>
          {(filtered) => <ProductGrid products={filtered} emptyMessage="No products match those filters." />}
        </CatalogFilters>
      )}
    </div>
  );
}
