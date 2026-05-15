import { Link } from "react-router-dom";
import styles from "./StaticPages.module.css";

export function NotFoundPage() {
  return (
    <div className={styles.article}>
      <h1 className={styles.h1}>Page not found</h1>
      <p className={styles.p}>That URL does not exist. Try the catalog or head home.</p>
      <p className={styles.p}>
        <Link to="/">Home</Link> · <Link to="/catalog">Catalog</Link>
      </p>
    </div>
  );
}
