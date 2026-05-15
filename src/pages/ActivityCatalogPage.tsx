import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogFilters } from "@/components/CatalogFilters";
import { ProductGrid } from "@/components/ProductGrid";
import { SHOP_ACTIVITIES } from "@/lib/home-feed";
import { loadCatalogProducts } from "@/lib/catalog-products";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import styles from "./CategoryCatalogPage.module.css";

export function ActivityCatalogPage() {
  const { activitySlug = "" } = useParams();
  const meta = SHOP_ACTIVITIES.find((a) => a.slug === activitySlug);
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meta) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { products: list } = await loadCatalogProducts({ activitySlug: meta.slug });
      if (!cancelled) {
        setProducts(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta]);

  if (!meta) {
    return (
      <div>
        <h1 className={styles.h1}>Activity not found</h1>
        <p className={styles.muted}>
          <BackButton fallback="/">Back</BackButton>
        </p>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Shop by activity", to: "/#shop-activity" },
          { label: meta.title },
        ]}
      />
      <header className={styles.header}>
        <h1 className={styles.h1}>{meta.title}</h1>
        <p className={styles.lead}>Products linked to this activity from catalog metadata and sport-specific product imports.</p>
      </header>
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
