import { BackButton } from "@/components/BackButton";
import styles from "./StaticPages.module.css";

export function AboutPage() {
  return (
    <article className={styles.article}>
      <h1 className={styles.h1}>About EXCH.</h1>
      <p className={styles.p}>
        EXCH. is a multi-vendor marketplace starter: peer asks and bids with Supabase, catalog in{" "}
        <code className={styles.code}>catalog_products</code> (or a bundled local seed), and a storefront tuned for sneakers and
        streetwear-style categories.
      </p>
      <p className={styles.p}>
        Use it as a starting point for authentication, departments, brands, and payment flows you control end to end.
      </p>
      <p className={styles.p}>
        <BackButton fallback="/">Back</BackButton>
      </p>
    </article>
  );
}
