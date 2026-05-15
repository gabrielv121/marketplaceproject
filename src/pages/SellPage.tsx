import { Link } from "react-router-dom";
import styles from "./StaticPages.module.css";

export function SellPage() {
  return (
    <article className={styles.article}>
      <h1 className={styles.h1}>Sell on EXCH.</h1>
      <p className={styles.p}>
        Every account is a <strong>buyer</strong> first. When you want to sell, you use the same login — open any product,
        go to the <strong>Sell</strong> tab, and post an ask. There is no separate seller signup.
      </p>
      <p className={styles.p}>
        List an ask in seconds once you are signed in. Buyers see your price on the live order book. Manage listings from{" "}
        <Link to="/account">your account</Link>.
      </p>
      <ul className={styles.ul}>
        <li>Accurate photos and size tags reduce disputes.</li>
        <li>Ship within your stated window to keep good standing.</li>
        <li>Payouts go through whatever processor you connect next (Stripe recommended).</li>
      </ul>
      <p className={styles.p}>
        <Link to="/catalog">Browse catalog</Link> to pick a product, open the <strong>Sell</strong> tab, and set your ask.
      </p>
    </article>
  );
}
