import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { IconMail } from "@/components/HeaderIcons";
import { useAuth } from "@/context/AuthContext";
import { isP2pConfigured } from "@/lib/supabase";
import { friendlyAuthError } from "@/lib/auth-errors";
import styles from "./LoginPage.module.css";

export function SignupPage() {
  const navigate = useNavigate();
  const { user, loading, signUpWithPassword } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    void signUpWithPassword(email, password, displayName)
      .then(({ error: err, session }) => {
        if (err) {
          setError(friendlyAuthError(err.message));
          return;
        }
        if (session) {
          navigate("/account", { replace: true });
          return;
        }
        setMsg(
          "Account created. Check your inbox for a confirmation email from EXCH. (also check spam). After confirming, sign in here.",
        );
      })
      .finally(() => setBusy(false));
  };

  if (!isP2pConfigured()) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Sign up</p>
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
          <h1 className={styles.h1}>You already have an account.</h1>
          <p className={styles.lead}>{user.email}</p>
          <Link to="/account" className={styles.secondaryLink}>
            Go to account
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>EXCH. account</p>
        <h1 className={styles.h1}>Create account</h1>
        <p className={styles.lead}>Sign up to buy, sell, place bids, save favorites, and manage payouts.</p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.label}>
            Display name
            <input
              className={styles.input}
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              autoFocus
            />
          </label>
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
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              type="password"
              required
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className={styles.label}>
            Confirm password
            <input
              className={styles.input}
              type="password"
              required
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className={styles.submit} disabled={busy}>
            <IconMail width={17} height={17} />
            {busy ? "Creating..." : "Create account"}
          </button>
        </form>

        {error ? <p className={`${styles.msg} ${styles.error}`}>{error}</p> : null}
        {msg ? (
          <>
            <p className={styles.msg}>{msg}</p>
            <Link to="/login" className={styles.secondaryLink}>
              Go to sign in
            </Link>
          </>
        ) : null}

        <p className={styles.switchAuth}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>

        <p className={styles.finePrint}>
          By creating an account, you agree to the <Link to="/legal/terms">Terms</Link> and acknowledge the{" "}
          <Link to="/legal/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </div>
  );
}
