import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CatalogProductImage } from "@/components/CatalogProductImage";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import { fetchSearchSuggestions, normalizeBrandSlug } from "@/lib/catalog-supabase";
import { formatMoney } from "@/lib/money-format";
import styles from "./SearchSuggestions.module.css";

type Item =
  | { kind: "brand"; key: string; label: string; to: string }
  | { kind: "product"; key: string; product: CatalogProductSummary; to: string };

/** Debounced product and brand suggestions under a search input. */
function useSearchSuggestions(input: string, enabled: boolean) {
  const [items, setItems] = useState<Item[]>([]);
  const query = input.trim();

  useEffect(() => {
    if (!enabled || query.length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchSearchSuggestions(query, 6)
        .then((products) => {
          if (cancelled) return;
          const needle = query.toLowerCase();
          const brands = [...new Set(products.map((p) => p.brand).filter((b): b is string => Boolean(b)))]
            .filter((b) => b.toLowerCase().includes(needle))
            .slice(0, 2);
          setItems([
            ...brands.map((b) => ({
              kind: "brand" as const,
              key: `brand:${b}`,
              label: b,
              to: `/brands/${normalizeBrandSlug(b)}`,
            })),
            ...products.map((p) => ({ kind: "product" as const, key: p.handle, product: p, to: `/product/${p.handle}` })),
          ]);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  return items;
}

export function SearchSuggestions({
  input,
  open,
  onClose,
  children,
}: {
  input: string;
  open: boolean;
  onClose: () => void;
  children: (props: {
    role: "combobox";
    "aria-expanded": boolean;
    "aria-controls": string;
    "aria-autocomplete": "list";
    "aria-activedescendant": string | undefined;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  }) => ReactNode;
}) {
  const listId = useId();
  const navigate = useNavigate();
  const items = useSearchSuggestions(input, open);
  const [active, setActive] = useState(-1);
  const visible = open && items.length > 0;

  useEffect(() => setActive(-1), [items]);

  const pick = (item: Item) => {
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!visible) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className={styles.wrap}>
      {children({
        role: "combobox",
        "aria-expanded": visible,
        "aria-controls": listId,
        "aria-autocomplete": "list",
        "aria-activedescendant": visible && active >= 0 ? `${listId}-${active}` : undefined,
        onKeyDown,
      })}
      {visible ? (
        <ul id={listId} role="listbox" className={styles.list}>
          {items.map((item, i) => (
            <li
              key={item.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? `${styles.item} ${styles.active}` : styles.item}
              onMouseEnter={() => setActive(i)}
              // mousedown so the pick lands before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
            >
              {item.kind === "brand" ? (
                <>
                  <span className={styles.brandIcon} aria-hidden>
                    {item.label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className={styles.text}>
                    <span className={styles.title}>{item.label}</span>
                    <span className={styles.sub}>Brand</span>
                  </span>
                </>
              ) : (
                <>
                  <span className={styles.thumb}>
                    <CatalogProductImage product={item.product} width={56} alt="" />
                  </span>
                  <span className={styles.text}>
                    <span className={styles.title}>{item.product.title}</span>
                    <span className={styles.sub}>
                      {item.product.brand ?? ""}
                      {Number(item.product.priceRange.min) > 0
                        ? ` · from ${formatMoney({ amount: item.product.priceRange.min, currencyCode: item.product.priceRange.currency })}`
                        : ""}
                    </span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
