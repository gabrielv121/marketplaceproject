import { isP2pConfigured } from "@/lib/supabase";
import styles from "./SetupBanner.module.css";

export function SetupBanner() {
  if (isP2pConfigured()) return null;

  const host =
    typeof window !== "undefined" && /vercel\.app$/i.test(window.location.hostname)
      ? "Vercel → Project → Settings → Environment Variables"
      : ".env.local in the project root";

  return (
    <div className={styles.banner} role="status">
      <strong>Supabase not connected.</strong> Add <code>VITE_SUPABASE_URL</code> and{" "}
      <code>VITE_SUPABASE_ANON_KEY</code> in {host}, redeploy, then set Supabase Auth Site URL to this domain.
    </div>
  );
}
