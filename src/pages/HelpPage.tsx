import { Link } from "react-router-dom";
import styles from "./StaticPages.module.css";

export function HelpPage() {
  return (
    <article className={styles.article}>
      <h1 className={styles.h1}>Help</h1>
      <section className={styles.section}>
        <h2 className={styles.h2}>Buying</h2>
        <p className={styles.p}>
          Everyone shops as a buyer. Sign in to place bids or buy from peers. Your <Link to="/account">account</Link>{" "}
          shows bids and trades. Peer buys stay in <strong>pending payment</strong> until you wire payments.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>Selling & bids</h2>
        <p className={styles.p}>
          Same login as buying: open any product&apos;s <strong>Sell</strong> tab to post an ask. No separate seller
          account — see <Link to="/sell">Sell</Link> and your <Link to="/account">account</Link> for active listings.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>Catalog tags</h2>
        <p className={styles.p}>
          Tag rows in <code className={styles.code}>catalog_products</code> (or the bundled seed) with <code className={styles.code}>dept-men</code>,{" "}
          <code className={styles.code}>dept-women</code>, <code className={styles.code}>dept-kids</code>, or{" "}
          <code className={styles.code}>dept-accessories</code> so department pages stay accurate.
        </p>
      </section>
      <p className={styles.p}>
        <Link to="/">Home</Link> · <Link to="/catalog">Catalog</Link>
      </p>
    </article>
  );
}
