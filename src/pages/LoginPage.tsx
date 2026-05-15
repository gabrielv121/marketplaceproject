import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { IconMail } from "@/components/HeaderIcons";
import { useAuth } from "@/context/AuthContext";
import { isP2pConfigured } from "@/lib/supabase";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = new URLSearchParams(location.search).get("next") || "/account";

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    void signInWithPassword(email, password)
      .then(({ error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        navigate(next, { replace: true });
      })
      .finally(() => setBusy(false));
  };

  if (!isP2pConfigured()) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Sign in</p>
          <h1 className={styles.h1}>Supabase is not configured</h1>
          <p className={styles.lead}>
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> (local) or
            Vercel Environment Variables (production), then redeploy.
          </p>
          <BackButton fallback="/" className={styles.secondaryLink}>
            Back
          </BackButton>
        </section>
      </div>
    );
  }

  if (!loading && user?.email) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Logged in</p>
          <h1 className={styles.h1}>You&apos;re already signed in.</h1>
          <p className={styles.lead}>{user.email}</p>
          <Link to={next} className={styles.secondaryLink}>
            Continue
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>EXCH. account</p>
        <h1 className={styles.h1}>Sign in</h1>
        <p className={styles.lead}>
          Use your email and password to access buying, selling, bids, favorites, and payouts.
        </p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.label}>
            Email address
            <input
              className={styles.input}
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              type="password"
              required
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className={styles.submit} disabled={busy}>
            <IconMail width={17} height={17} />
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {error ? <p className={`${styles.msg} ${styles.error}`}>{error}</p> : null}

        <p className={styles.switchAuth}>
          New to EXCH.?{" "}
          <Link to={`/signup?next=${encodeURIComponent(next)}`}>
            Create an account
          </Link>
        </p>

        <p className={styles.finePrint}>
          By continuing, you agree to the <Link to="/legal/terms">Terms</Link> and acknowledge the{" "}
          <Link to="/legal/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </div>
  );
}
