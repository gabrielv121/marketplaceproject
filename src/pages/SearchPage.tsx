import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProductGrid } from "@/components/ProductGrid";
import { searchCatalogProducts } from "@/lib/catalog-products";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import styles from "./SearchPage.module.css";

const QUICK_SEARCHES = [
  "Jordan",
  "Nike",
  "UGG",
  "North Face",
  "Moncler",
  "Puffer",
  "Margiela",
  "Rick Owens",
  "Guidi",
  "Designer",
];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const [input, setInput] = useState(q);
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInput(q);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { products: list, error: err } = await searchCatalogProducts(q);
      if (!cancelled) {
        setProducts(list);
        setError(err);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  const results = products;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = input.trim();
    setParams(next ? { q: next } : {});
  };

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
        <button type="submit" className={styles.button}>
          Search
        </button>
        {q ? (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => {
              setInput("");
              setParams({});
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      <div className={styles.meta}>
        <span>
          {loading ? "Loading catalog..." : q ? `${results.length} result${results.length === 1 ? "" : "s"} for "${q}"` : `${products.length} products`}
        </span>
        <div className={styles.quick} aria-label="Quick searches">
          {QUICK_SEARCHES.map((term) => (
            <Link key={term} to={`/search?q=${encodeURIComponent(term)}`} className={styles.chip}>
              {term}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <p className={styles.warn} role="status">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className={styles.muted}>Loading...</p>
      ) : (
        <ProductGrid
          products={results}
          emptyMessage={q ? "No products match that search yet." : "No products available."}
        />
      )}
    </div>
  );
}
