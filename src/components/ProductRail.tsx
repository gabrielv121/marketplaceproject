import { ProductCard } from "@/components/ProductCard";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import styles from "./ProductRail.module.css";

type Props = { products: CatalogProductSummary[] };

export function ProductRail({ products }: Props) {
  if (!products.length) return null;
  return (
    <ul className={styles.rail}>
      {products.map((p) => (
        <li key={p.id} className={styles.li}>
          <ProductCard product={p} visual="stockx" />
        </li>
      ))}
    </ul>
  );
}
