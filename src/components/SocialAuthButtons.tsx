import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { friendlyAuthError } from "@/lib/auth-errors";
import { IconGoogle } from "@/components/SocialAuthIcons";
import styles from "@/pages/LoginPage.module.css";

type OAuthProvider = "google" | "apple";

export function SocialAuthButtons({ next }: { next: string }) {
  const { signInWithOAuth } = useAuth();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = (provider: OAuthProvider) => {
    setError(null);
    setBusy(provider);
    void signInWithOAuth(provider, next).then(({ error: err }) => {
      if (err) {
        setError(friendlyAuthError(err.message));
        setBusy(null);
      }
    });
  };

  return (
    <div className={styles.social}>
      <button type="button" className={styles.socialBtn} disabled={busy !== null} onClick={() => start("google")}>
        <IconGoogle />
        {busy === "google" ? "Opening Google..." : "Continue with Google"}
      </button>
      {error ? <p className={`${styles.msg} ${styles.error}`}>{error}</p> : null}
      <p className={styles.divider}>or</p>
    </div>
  );
}
