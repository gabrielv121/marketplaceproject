import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BRAND_NAME } from "@/lib/brand";
import { isWaitlistOnlySite } from "@/lib/site-mode";
import { isP2pConfigured } from "@/lib/supabase";
import { joinWaitlist } from "@/lib/waitlist";
import styles from "./WaitlistPage.module.css";

function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={className}>
      V<span className={styles.logoAccent}>R</span>NA
    </span>
  );
}

export function WaitlistPage() {
  const [searchParams] = useSearchParams();
  const source = useMemo(() => {
    const raw = searchParams.get("source") ?? searchParams.get("utm_source") ?? "web";
    const trimmed = raw.trim().slice(0, 40);
    return trimmed || "web";
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ alreadyJoined: boolean } | null>(null);

  const waitlistOnly = isWaitlistOnlySite();
  const configured = isP2pConfigured();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    void joinWaitlist({ email, name, source })
      .then((result) => {
        setDone({ alreadyJoined: result.alreadyJoined });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not join the waitlist.");
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link to={waitlistOnly ? "/waitlist" : "/"} className={styles.logo} aria-label={`${BRAND_NAME} home`}>
          <BrandLogo />
        </Link>
        <p className={styles.kicker}>Early access</p>
        <h1 className={styles.h1}>{BRAND_NAME} is opening soon</h1>
        <p className={styles.lead}>
          Join the waitlist for first access to a verified peer marketplace — bids, asks, and authenticated delivery.
          {source === "tiktok" ? " Thanks for finding us on TikTok." : null}
        </p>

        {!configured ? (
          <p className={styles.error} role="status">
            Waitlist is not connected yet. Add Supabase env vars and run the waitlist migration in the SQL editor.
          </p>
        ) : done ? (
          <p className={styles.success} role="status">
            {done.alreadyJoined
              ? "You're already on the list — we'll email you when we open."
              : "You're on the list. Watch your inbox (and spam) for launch updates."}
          </p>
        ) : (
          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>Email</span>
              <input
                className={styles.input}
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Name (optional)</span>
              <input
                className={styles.input}
                type="text"
                name="name"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? "Joining..." : "Join waitlist"}
            </button>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </form>
        )}

        <p className={styles.foot}>
          We only use your email for launch updates. See our{" "}
          <Link to="/legal/privacy">Privacy Policy</Link>.
        </p>
      </div>

      {waitlistOnly ? null : (
        <Link to="/" className={styles.previewLink}>
          Preview the marketplace →
        </Link>
      )}
    </div>
  );
}
