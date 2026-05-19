import { Link } from "react-router-dom";
import styles from "./StaticPages.module.css";

export function HelpPage() {
  return (
    <article className={styles.article}>
      <h1 className={styles.h1}>Help</h1>
      <section className={styles.section}>
        <h2 className={styles.h2}>Buying</h2>
        <p className={styles.p}>
          Sign in to place bids or buy a peer&apos;s lowest ask on any product page. When you reserve a listing or match
          a bid, you&apos;ll complete payment in <strong>Stripe Checkout</strong> (card). Until payment succeeds, the
          trade stays in <strong>pending payment</strong> and the listing stays reserved for about 30 minutes.
        </p>
        <p className={styles.p}>
          After payment, EXCH. holds funds while the seller ships to us for verification, then we ship to you. Track
          progress in your <Link to="/account">account</Link> or on the trade detail page.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>Selling & bids</h2>
        <p className={styles.p}>
          Use the same login as buying: open any product&apos;s <strong>Sell</strong> tab to post an ask with photos
          and condition details. Connect Stripe on your <Link to="/account">account</Link> before payouts can be
          released. See <Link to="/sell">Sell</Link> for listing tips and <Link to="/legal/fees">fees</Link> for
          marketplace and processing charges.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>Privacy between buyers and sellers</h2>
        <p className={styles.p}>
          You deal with <strong>EXCH.</strong>, not the other person directly. Buyers and sellers do not see each
          other&apos;s name, email, phone, or home address in the app. Delivery and payouts are handled through EXCH.
          verification and Stripe.
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>Market data on product pages</h2>
        <p className={styles.p}>
          Lowest ask, highest bid, last sale, and the order book show <strong>live peer activity</strong> only — there
          is no placeholder depth. If a size has no asks or bids yet, those fields show a dash until someone lists or
          bids.
        </p>
      </section>
      <p className={styles.p}>
        <Link to="/">Home</Link> · <Link to="/catalog">Catalog</Link>
      </p>
    </article>
  );
}
