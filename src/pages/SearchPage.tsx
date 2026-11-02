import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CatalogFilters } from "@/components/CatalogFilters";
import { PagedCatalog } from "@/components/PagedCatalog";
import { ProductGrid } from "@/components/ProductGrid";
import { logSearchEvent } from "@/lib/analytics-events";
import { isRailSearchQuery, searchCatalogProducts } from "@/lib/catalog-products";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import { tokenizeCatalogSearchQuery } from "@/lib/catalog-search";
import styles from "./SearchPage.module.css";

const QUICK_SEARCHES = ["Jordan", "Nike", "UGG", "Yeezy", "Apparel"];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const [input, setInput] = useState(q);
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tagged with its query so a previous search's count never shows next to the new query.
  const [result, setResult] = useState<{ q: string; count: number } | null>(null);
  const total = result?.q === q ? result.count : null;

  const railQuery = isRailSearchQuery(q);
  const terms = useMemo(() => tokenizeCatalogSearchQuery(q), [q]);

  useEffect(() => {
    setInput(q);
  }, [q]);

  // Rail words ("designer", "sneakers", "deals") filter the home pool on the client.
  useEffect(() => {
    if (!railQuery) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { products: list, error: err } = await searchCatalogProducts(q);
      if (!cancelled) {
        setProducts(list);
        setError(err);
        setLoading(false);
        setResult({ q, count: list.length });
        logSearchEvent({ query: q, resultCount: list.length, path: "/search" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, railQuery]);

  const onPagedTotal = useCallback(
    (count: number) => {
      setResult({ q, count });
      if (q) logSearchEvent({ query: q, resultCount: count, path: "/search" });
    },
    [q],
  );

  const hasActiveSearch = Boolean(q);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = input.trim();
    setParams(next ? { q: next } : {});
  };

  const clearSearch = () => {
    setInput("");
    setParams({});
  };

  const onProductNavigate = (handle: string) => {
    if (q) {
      logSearchEvent({
        query: q,
        resultCount: total ?? 0,
        clickedHandle: handle,
        path: "/search",
      });
    }
  };

  const emptyMessage = q ? "No products match that search yet." : "No products available.";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Search</p>
        <h1 className={styles.h1}>Find products</h1>
        <p className={styles.lead}>Search product names, brands, handles, tags, departments, and categories.</p>
      </header>

      <form className={styles.searchBox} role="search" onSubmit={submit}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search sneakers, brands, sizes, tags..."
          autoFocus
        />
        {hasActiveSearch ? (
          <button type="button" className={styles.actionBtn} data-mode="clear" onClick={clearSearch}>
            Clear
          </button>
        ) : (
          <button type="submit" className={styles.actionBtn} data-mode="search">
            Search
          </button>
        )}
      </form>

      <div className={styles.meta}>
        <span>
          {total == null
            ? "Loading catalog..."
            : q
              ? `${total} result${total === 1 ? "" : "s"} for "${q}"`
              : `${total} products`}
        </span>
        <div className={styles.quick} aria-label="Quick searches">
          {QUICK_SEARCHES.map((term) => (
            <Link key={term} to={`/search?q=${encodeURIComponent(term)}`} className={styles.chip}>
              {term}
            </Link>
          ))}
        </div>
      </div>

      {railQuery ? (
        <>
          {error ? (
            <p className={styles.warn} role="status">
              {error}
            </p>
          ) : null}
          {loading ? (
            <p className={styles.muted}>Loading...</p>
          ) : (
            <CatalogFilters products={products} hideWithoutProductPhoto>
              {(filtered) => (
                <ProductGrid products={filtered} emptyMessage={emptyMessage} onProductNavigate={onProductNavigate} />
              )}
            </CatalogFilters>
          )}
        </>
      ) : (
        <PagedCatalog
          key={q}
          terms={terms}
          showSearch={false}
          fallback={() => searchCatalogProducts(q)}
          emptyMessage={emptyMessage}
          onProductNavigate={onProductNavigate}
          onTotal={onPagedTotal}
        />
      )}
    </div>
  );
}
