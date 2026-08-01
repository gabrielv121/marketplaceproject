import { BackButton } from "@/components/BackButton";
import { CONTACT_EMAILS, SUPPORT_EMAIL } from "@/lib/contact-emails";
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
      <section className={styles.section}>
        <h2 className={styles.h2}>Get in touch</h2>
        <p className={styles.p}>
          Reach us at{" "}
          <a className={styles.contactLink} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          for orders and account help, or pick the address that fits:
        </p>
        <ul className={styles.contactList}>
          {CONTACT_EMAILS.map((item) => (
            <li key={item.address} className={styles.contactItem}>
              <a className={styles.contactLink} href={`mailto:${item.address}`}>
                {item.address}
              </a>
              <span className={styles.contactMeta}>
                <strong>{item.label}</strong> — {item.blurb}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className={styles.p}>
        <BackButton fallback="/">Back</BackButton>
      </p>
    </article>
  );
}
