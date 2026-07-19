import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { IconMail } from "@/components/HeaderIcons";
import { useAuth } from "@/context/AuthContext";
import { requestWelcomeOrVerifyEmail } from "@/lib/email-verification";
import { isP2pConfigured } from "@/lib/supabase";
import { friendlyAuthError } from "@/lib/auth-errors";
import styles from "./LoginPage.module.css";

export function SignupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, signUpWithPassword } = useAuth();
  const next = new URLSearchParams(location.search).get("next") || "/";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
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
      .then(async ({ error: err, session }) => {
        if (err) {
          setError(friendlyAuthError(err.message));
          return;
        }
        if (session) {
          try {
            await requestWelcomeOrVerifyEmail({ reason: "welcome" });
          } catch {
            /* welcome email is best-effort; user can resend from Account */
          }
          navigate(next, { replace: true });
          return;
        }
        const loginSearch = new URLSearchParams({ next });
        navigate(`/login?${loginSearch.toString()}`, {
          replace: true,
          state: {
            signupMessage:
              "Account created, but you were not signed in automatically. Sign in below. If this keeps happening, turn Confirm email OFF in Supabase Auth → Providers → Email.",
            email: email.trim(),
          },
        });
      })
      .finally(() => setBusy(false));
  };

  if (!isP2pConfigured()) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Sign up</p>
          <h1 className={styles.h1}>Sign-up unavailable</h1>
          <p className={styles.lead}>
            New accounts cannot be created on this site right now. Please try again later or contact support.
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
        <p className={styles.eyebrow}>VRNA account</p>
        <h1 className={styles.h1}>Create account</h1>
        <p className={styles.lead}>
          Sign up to browse instantly. Verify your email later when you buy, bid, or list.
        </p>

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

        <p className={styles.switchAuth}>
          Already have an account?{" "}
          <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>

        <p className={styles.finePrint}>
          By creating an account, you agree to the <Link to="/legal/terms">Terms</Link> and acknowledge the{" "}
          <Link to="/legal/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </div>
  );
}
