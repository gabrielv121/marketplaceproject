import type { CatalogProductSummary } from "@/lib/catalog-product";
import { ProductCard } from "@/components/ProductCard";
import { useProductFavorites } from "@/hooks/useProductFavorites";
import styles from "./ProductGrid.module.css";

type Props = {
  products: CatalogProductSummary[];
  emptyMessage?: string;
  /** Home feed: 6 columns on desktop, equal card widths */
  layout?: "default" | "homeSix";
};

export function ProductGrid({ products, emptyMessage = "Nothing here yet.", layout = "default" }: Props) {
  const { favoriteHandles, favoriteBusyHandle, onToggleFavorite } = useProductFavorites();

  if (!products.length) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }
  const gridClass = layout === "homeSix" ? `${styles.grid} ${styles.gridHomeSix}` : styles.grid;
  return (
    <ul className={gridClass}>
      {products.map((p) => (
        <li key={p.id} className={styles.li}>
          <ProductCard
            product={p}
            visual={layout === "homeSix" ? "stockx" : "default"}
            favorite={favoriteHandles.has(p.handle)}
            favoriteBusy={favoriteBusyHandle === p.handle}
            onToggleFavorite={onToggleFavorite}
          />
        </li>
      ))}
    </ul>
  );
}
