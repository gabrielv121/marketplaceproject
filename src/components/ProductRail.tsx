import { ProductCard } from "@/components/ProductCard";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import { useProductFavorites } from "@/hooks/useProductFavorites";
import styles from "./ProductRail.module.css";

type Props = { products: CatalogProductSummary[] };

export function ProductRail({ products }: Props) {
  const { favoriteHandles, favoriteBusyHandle, onToggleFavorite } = useProductFavorites();
  if (!products.length) return null;
  return (
    <ul className={styles.rail}>
      {products.map((p) => (
        <li key={p.id} className={styles.li}>
          <ProductCard
            product={p}
            visual="stockx"
            favorite={favoriteHandles.has(p.handle)}
            favoriteBusy={favoriteBusyHandle === p.handle}
            onToggleFavorite={onToggleFavorite}
          />
        </li>
      ))}
    </ul>
  );
}
