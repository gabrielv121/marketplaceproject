import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PagedCatalog } from "@/components/PagedCatalog";
import { loadCatalogProducts } from "@/lib/catalog-products";
import styles from "./CategoryCatalogPage.module.css";

export function NewArrivalsPage() {
  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "New arrivals" }]} />
      <header className={styles.header}>
        <h1 className={styles.h1}>New arrivals</h1>
        <p className={styles.lead}>The latest additions and updates across the catalog.</p>
      </header>
      <PagedCatalog defaultSort="new" fallback={() => loadCatalogProducts({ sortNew: true })} />
    </div>
  );
}
