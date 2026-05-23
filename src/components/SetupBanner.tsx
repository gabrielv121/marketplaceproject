import { isP2pConfigured } from "@/lib/supabase";
import styles from "./SetupBanner.module.css";

export function SetupBanner() {
  if (isP2pConfigured()) return null;

  return (
    <div className={styles.banner} role="status">
      <strong>Sign-in and checkout are temporarily unavailable.</strong> Account services are being configured — please check
      back soon.
    </div>
  );
}
