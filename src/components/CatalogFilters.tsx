import { useMemo, useState } from "react";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import { countWithoutRealProductImage, hasRealCatalogProductImage, sortCatalogByImageQuality } from "@/lib/catalog-image-quality";
import styles from "./CatalogFilters.module.css";

type SortKey = "trending" | "price-low" | "price-high" | "name";

type Props = {
  products: CatalogProductSummary[];
  /** Hide Kicks rows that only have StockX placeholder art (no product photo). */
  hideWithoutProductPhoto?: boolean;
  children: (products: CatalogProductSummary[]) => React.ReactNode;
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function productText(product: CatalogProductSummary): string {
  return [
    product.title,
    product.brand,
    product.handle,
    product.productType,
    product.category,
    product.gender,
    ...(product.tags ?? []),
    ...(product.activities ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function price(product: CatalogProductSummary, key: "min" | "max"): number {
  const value = Number(product.priceRange[key]);
  return Number.isFinite(value) ? value : 0;
}

export function CatalogFilters({ products, hideWithoutProductPhoto = false, children }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState<SortKey>("trending");

  const brands = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) {
      const name = product.brand?.trim();
      if (!name) continue;
      map.set(normalize(name), name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const types = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) {
      const name = product.productType?.trim() || product.variantSizePreset || "product";
      map.set(normalize(name), name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const hiddenPhotoCount = hideWithoutProductPhoto ? countWithoutRealProductImage(products) : 0;

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = products.filter((product) => {
      if (hideWithoutProductPhoto && !hasRealCatalogProductImage(product)) return false;
      if (brand !== "all" && normalize(product.brand ?? "") !== brand) return false;
      const productType = product.productType?.trim() || product.variantSizePreset || "product";
      if (type !== "all" && normalize(productType) !== type) return false;
      if (!terms.length) return true;
      const text = productText(product);
      return terms.every((term) => text.includes(term));
    });
    if (sort === "trending") return sortCatalogByImageQuality(list);
    return [...list].sort((a, b) => {
      if (sort === "price-low") return price(a, "min") - price(b, "min") || a.title.localeCompare(b.title);
      if (sort === "price-high") return price(b, "max") - price(a, "max") || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });
  }, [brand, hideWithoutProductPhoto, products, query, sort, type]);
  const activeCount = [query.trim(), brand !== "all", type !== "all", sort !== "trending"].filter(Boolean).length;

  const clearFilters = () => {
    setQuery("");
    setBrand("all");
    setType("all");
    setSort("trending");
  };

  return (
    <>
      <button
        type="button"
        className={styles.mobileToggle}
        aria-expanded={open}
        aria-controls="catalog-filters"
        onClick={() => setOpen((next) => !next)}
      >
        <span>{open ? "Hide filters" : "Show filters"}</span>
        {activeCount ? <span className={styles.badge}>{activeCount}</span> : null}
      </button>
      <section
        id="catalog-filters"
        className={open ? `${styles.filters} ${styles.filtersOpen}` : styles.filters}
        aria-label="Catalog filters"
      >
        <label className={styles.field}>
          <span>Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this page"
            className={styles.input}
          />
        </label>
        <label className={styles.field}>
          <span>Brand</span>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className={styles.select}>
            <option value="all">All brands</option>
            {brands.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={styles.select}>
            <option value="all">All types</option>
            {types.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={styles.select}>
            <option value="trending">Trending</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="name">Name</option>
          </select>
        </label>
        {activeCount ? (
          <button type="button" className={styles.clearBtn} onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </section>
      <p className={styles.count}>
        Showing {filtered.length} of {products.length} products
        {hiddenPhotoCount ? ` · ${hiddenPhotoCount} hidden (no product photo from Kicks)` : ""}
        {brand !== "all" ? ` · brand: ${brands.find(([s]) => s === brand)?.[1] ?? brand}` : ""}
        {query.trim() ? ` · search: “${query.trim()}”` : ""}
      </p>
      {children(filtered)}
    </>
  );
}
