import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { friendlyAuthError } from "@/lib/auth-errors";
import { safeNextPath } from "@/lib/auth-redirect";
import styles from "./LoginPage.module.css";

export function AuthCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const params = new URLSearchParams(location.search);
  const next = safeNextPath(params.get("next"), "/account");
  const providerError = params.get("error_description") || params.get("error");
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (providerError || loading) return;
    if (user) {
      navigate(next, { replace: true });
      return;
    }
    const timer = window.setTimeout(() => setStuck(true), 4000);
    return () => window.clearTimeout(timer);
  }, [loading, navigate, next, providerError, user]);

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>VRNA account</p>
        <h1 className={styles.h1}>{providerError || stuck ? "Sign-in did not finish" : "Signing you in"}</h1>
        <p className={styles.lead}>
          {providerError
            ? friendlyAuthError(providerError)
            : stuck
              ? "Google did not return a session. Try again from the sign-in page."
              : "Finishing sign-in and taking you back."}
        </p>
        <Link to={`/login?next=${encodeURIComponent(next)}`} className={styles.secondaryLink}>
          Back to sign in
        </Link>
      </section>
    </div>
  );
}
