import { ReturnLink } from "@/components/ReturnLink";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import { formatMoney } from "@/lib/money-format";
import type { Money } from "@/types/marketplace";
import { getDepartmentBySlug } from "@/lib/catalog-taxonomy";
import styles from "./ProductCard.module.css";

type Props = {
  product: CatalogProductSummary;
  /** StockX-style home tile: light well, lowest ask row, optional last sale */
  visual?: "default" | "stockx";
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function mockLastSale(p: CatalogProductSummary): Money {
  const low = Number(p.priceRange.min);
  const delta = hashString(p.handle) % 28;
  const n = Math.max(1, Math.round(low - 4 - delta * 0.35));
  return { amount: String(n), currencyCode: p.priceRange.currency };
}

export function ProductCard({ product, visual = "default" }: Props) {
  const img = product.featuredImageUrl;
  const low = {
    amount: product.priceRange.min,
    currencyCode: product.priceRange.currency,
  };
  const dept = product.departmentSlug ? getDepartmentBySlug(product.departmentSlug) : undefined;
  const showXpress = hashString(product.id + product.handle) % 3 !== 0;
  const last = mockLastSale(product);

  if (visual === "stockx") {
    return (
      <div className={styles.cardStockx}>
        <ReturnLink to={`/product/${product.handle}`} className={styles.cardStockxLink}>
          <div className={styles.imageWell}>
            {img ? (
              <img src={img} alt={product.title} className={styles.imageStockx} loading="lazy" />
            ) : (
              <div className={styles.placeholderStockx} aria-hidden />
            )}
            {dept ? (
              <span className={styles.badgeLight} aria-hidden>
                {dept.title}
              </span>
            ) : null}
          </div>
          <div className={styles.metaStockx}>
            <h2 className={styles.titleStockx}>{product.title}</h2>
            {product.brand ? <p className={styles.brandStockx}>{product.brand}</p> : null}
            <p className={styles.askLabel}>Lowest ask</p>
            <p className={styles.priceStockx}>{formatMoney(low)}</p>
            <p className={styles.lastSale}>Last Sale: {formatMoney(last)}</p>
            {showXpress ? (
              <p className={styles.xpress}>
                <span className={styles.xpressIcon} aria-hidden>
                  ◆
                </span>{" "}
                Xpress ship
              </p>
            ) : null}
          </div>
        </ReturnLink>
        <button
          type="button"
          className={styles.favBtn}
          aria-label="Save to favorites"
          title="Save"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          ♡
        </button>
      </div>
    );
  }

  return (
    <ReturnLink to={`/product/${product.handle}`} className={styles.card}>
      <div className={styles.imageWrap}>
        {dept ? <span className={styles.badge}>{dept.title}</span> : null}
        {img ? (
          <img src={img} alt="" className={styles.image} loading="lazy" />
        ) : (
          <div className={styles.placeholder} aria-hidden />
        )}
      </div>
      <div className={styles.body}>
        <div className={styles.brandRow}>
          {product.brand ? <p className={styles.brand}>{product.brand}</p> : null}
        </div>
        <h2 className={styles.title}>{product.title}</h2>
        <p className={styles.price}>From {formatMoney(low)}</p>
      </div>
    </ReturnLink>
  );
}
