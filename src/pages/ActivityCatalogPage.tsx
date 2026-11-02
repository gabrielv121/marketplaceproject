import { useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PagedCatalog } from "@/components/PagedCatalog";
import { loadCatalogProducts } from "@/lib/catalog-products";
import { SHOP_ACTIVITIES } from "@/lib/home-feed";
import styles from "./CategoryCatalogPage.module.css";

export function ActivityCatalogPage() {
  const { activitySlug = "" } = useParams();
  const meta = SHOP_ACTIVITIES.find((a) => a.slug === activitySlug);

  if (!meta) {
    return (
      <div>
        <h1 className={styles.h1}>Activity not found</h1>
        <p className={styles.muted}>
          <BackButton fallback="/">Back</BackButton>
        </p>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Shop by activity", to: "/#shop-activity" },
          { label: meta.title },
        ]}
      />
      <header className={styles.header}>
        <h1 className={styles.h1}>{meta.title}</h1>
        <p className={styles.lead}>Footwear and apparel picked for this activity.</p>
      </header>
      <PagedCatalog
        key={meta.slug}
        activitySlug={meta.slug}
        fallback={() => loadCatalogProducts({ activitySlug: meta.slug })}
      />
    </div>
  );
}
