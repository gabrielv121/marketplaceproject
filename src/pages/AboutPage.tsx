import { BackButton } from "@/components/BackButton";
import styles from "./StaticPages.module.css";

export function AboutPage() {
  return (
    <article className={styles.article}>
      <h1 className={styles.h1}>About VRNA</h1>
      <p className={styles.p}>
        VRNA is a verified marketplace for sneakers and streetwear. Shop from peer listings, place bids, or list your own
        items from one account.
      </p>
      <p className={styles.p}>
        Every order is checked at our hub before it ships to you, so buyers and sellers can trade with confidence.
      </p>
      <p className={styles.p}>
        <BackButton fallback="/">Back</BackButton>
      </p>
    </article>
  );
}
