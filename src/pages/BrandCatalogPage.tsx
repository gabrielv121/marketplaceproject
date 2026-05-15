import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CatalogFilters } from "@/components/CatalogFilters";
import { ProductGrid } from "@/components/ProductGrid";
import { listBrandsFromProducts, loadCatalogProducts } from "@/lib/catalog-products";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import styles from "./CategoryCatalogPage.module.css";

function normalizeBrand(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function BrandCatalogPage() {
  const { brandSlug = "" } = useParams();
  const want = brandSlug.toLowerCase();
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [brandName, setBrandName] = useState<string>(brandSlug);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { products: all } = await loadCatalogProducts({});
      const meta = listBrandsFromProducts(all).find((b) => b.slug === want);
      const list = all.filter((p) => p.brand && normalizeBrand(p.brand) === want);
      if (!cancelled) {
        setProducts(list);
        if (meta) setBrandName(meta.name);
        else setBrandName(brandSlug);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandSlug, want]);

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Brands", to: "/brands" },
          { label: brandName },
        ]}
      />
      <header className={styles.header}>
        <h1 className={styles.h1}>{brandName}</h1>
        <p className={styles.lead}>
          <Link to="/brands">All brands</Link>
        </p>
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
