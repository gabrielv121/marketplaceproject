import { useCallback, useEffect, useRef, useState } from "react";
import { CatalogFilters } from "@/components/CatalogFilters";
import { ProductGrid } from "@/components/ProductGrid";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import {
  fetchCatalogFacets,
  fetchCatalogPage,
  type CatalogAudienceFilter,
  type CatalogFacet,
  type CatalogPageSort,
} from "@/lib/catalog-supabase";
import { enrichProductsForHome } from "@/lib/home-feed";
import styles from "./CatalogFilters.module.css";

const PAGE_SIZE = 60;

type Props = {
  audiences?: CatalogAudienceFilter[];
  activitySlug?: string;
  defaultSort?: CatalogPageSort;
  /** Whole-word search terms fixed by the page (the search page query). */
  terms?: string[];
  /** Hide the in-page search box when the page already has its own. */
  showSearch?: boolean;
  /** Used when the database query is unavailable (no Supabase, missing columns). */
  fallback: () => Promise<{ products: CatalogProductSummary[]; error: string | null }>;
  emptyMessage?: string;
  onProductNavigate?: (handle: string) => void;
  /** Called with the full match count each time the first page loads. */
  onTotal?: (total: number) => void;
};

function audiencesFromKey(key: string): CatalogAudienceFilter[] | undefined {
  return key ? (key.split(",") as CatalogAudienceFilter[]) : undefined;
}

function termsFromKey(key: string): string[] | undefined {
  return key ? key.split(" ") : undefined;
}

const SORT_LABELS: Record<CatalogPageSort, string> = {
  trending: "Trending",
  new: "Newest",
  "price-low": "Price: low to high",
  "price-high": "Price: high to low",
  name: "Name",
};

export function PagedCatalog({
  audiences,
  activitySlug,
  defaultSort = "trending",
  terms,
  showSearch = true,
  fallback,
  emptyMessage = "No products match those filters.",
  onProductNavigate,
  onTotal,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<CatalogPageSort>(defaultSort);
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<{ brands: CatalogFacet[]; types: CatalogFacet[] }>({ brands: [], types: [] });
  const [legacy, setLegacy] = useState<CatalogProductSummary[] | null>(null);
  const requestId = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const onTotalRef = useRef(onTotal);
  onTotalRef.current = onTotal;

  const audienceKey = (audiences ?? []).join(",");
  const termsKey = (terms ?? []).join(" ");

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    void fetchCatalogFacets({ audiences: audiencesFromKey(audienceKey), activitySlug, terms: termsFromKey(termsKey) })
      .then((res) => {
        if (!cancelled && res) setFacets(res);
      })
      .catch(() => {
        /* dropdowns stay empty */
      });
    return () => {
      cancelled = true;
    };
  }, [audienceKey, activitySlug, termsKey]);

  const fetchPage = useCallback(
    (offset: number) =>
      fetchCatalogPage({
        audiences: audiencesFromKey(audienceKey),
        activitySlug,
        brand: brand || undefined,
        productType: type || undefined,
        search,
        terms: termsFromKey(termsKey),
        sort,
        offset,
        pageSize: PAGE_SIZE,
      }),
    [audienceKey, activitySlug, brand, type, search, termsKey, sort],
  );

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    fetchPage(0)
      .then(async (page) => {
        if (id !== requestId.current) return;
        if (!page) {
          const { products: list, error: err } = await fallbackRef.current();
          if (id !== requestId.current) return;
          setLegacy(list);
          setError(err);
          onTotalRef.current?.(list.length);
          return;
        }
        setLegacy(null);
        setProducts(enrichProductsForHome(page.products));
        setTotal(page.total);
        onTotalRef.current?.(page.total ?? page.products.length);
      })
      .catch(async (e: unknown) => {
        if (id !== requestId.current) return;
        const { products: list } = await fallbackRef.current();
        if (id !== requestId.current) return;
        setLegacy(list);
        onTotalRef.current?.(list.length);
        setError(e instanceof Error ? e.message : "Catalog error");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    return () => {
      // Late responses from a previous filter set or an unmounted page must not report totals.
      requestId.current += 1;
    };
  }, [fetchPage]);

  const hasMore = total != null && products.length < total;

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    fetchPage(products.length)
      .then((page) => {
        if (id !== requestId.current || !page) return;
        setProducts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const next = [...prev, ...enrichProductsForHome(page.products).filter((p) => !seen.has(p.id))];
          // A short page means the count went stale (rows unpublished mid-scroll); stop here.
          if (page.products.length < PAGE_SIZE) setTotal(next.length);
          return next;
        });
      })
      .catch((e: unknown) => {
        if (id === requestId.current) setError(e instanceof Error ? e.message : "Could not load more products");
      })
      .finally(() => setLoadingMore(false));
  }, [fetchPage, hasMore, loading, loadingMore, products.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  if (legacy) {
    return (
      <>
        {error ? (
          <p className={styles.count} role="status">
            {error}
          </p>
        ) : null}
        <CatalogFilters products={legacy} hideWithoutProductPhoto>
          {(filtered) => (
            <ProductGrid products={filtered} emptyMessage={emptyMessage} onProductNavigate={onProductNavigate} />
          )}
        </CatalogFilters>
      </>
    );
  }

  const activeCount = [query.trim(), brand, type, sort !== defaultSort].filter(Boolean).length;
  const clearFilters = () => {
    setQuery("");
    setSearch("");
    setBrand("");
    setType("");
    setSort(defaultSort);
  };
  const sortKeys: CatalogPageSort[] =
    defaultSort === "new"
      ? ["new", "trending", "price-low", "price-high", "name"]
      : ["trending", "price-low", "price-high", "name"];

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
        className={[styles.filters, open ? styles.filtersOpen : "", showSearch ? "" : styles.filtersNoSearch]
          .filter(Boolean)
          .join(" ")}
        aria-label="Catalog filters"
      >
        {showSearch ? (
          <label className={styles.field}>
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search these products"
              className={styles.input}
            />
          </label>
        ) : null}
        <label className={styles.field}>
          <span>Brand</span>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className={styles.select}>
            <option value="">All brands</option>
            {facets.brands.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name} ({b.count})
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={styles.select}>
            <option value="">All types</option>
            {facets.types.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as CatalogPageSort)} className={styles.select}>
            {sortKeys.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        {activeCount ? (
          <button type="button" className={styles.clearBtn} onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </section>
      {error ? (
        <p className={styles.count} role="status">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className={styles.count}>Loading…</p>
      ) : (
        <>
          <p className={styles.count}>
            Showing {products.length} of {total ?? products.length} products
            {brand ? ` · brand: ${brand}` : ""}
            {search ? ` · search: “${search}”` : ""}
          </p>
          <ProductGrid products={products} emptyMessage={emptyMessage} onProductNavigate={onProductNavigate} />
          {hasMore ? (
            <div ref={sentinel} className={styles.loadMoreWrap}>
              <button type="button" className={styles.clearBtn} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
