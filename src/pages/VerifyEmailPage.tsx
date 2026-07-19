import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/context/AuthContext";
import { confirmEmailVerification, requestWelcomeOrVerifyEmail } from "@/lib/email-verification";
import { isP2pConfigured } from "@/lib/supabase";
import styles from "./LoginPage.module.css";

export function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token")?.trim() ?? "";
  const [status, setStatus] = useState<"idle" | "working" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isP2pConfigured() || loading) return;
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token. Open the link from your email, or request a new one from Account.");
      return;
    }
    if (!user) {
      const next = `/verify-email?token=${encodeURIComponent(token)}`;
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    let cancelled = false;
    setStatus("working");
    void confirmEmailVerification(token)
      .then(() => {
        if (cancelled) return;
        setStatus("ok");
        setMessage("Email verified. You can buy, bid, and list on VRNA.");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Could not verify email");
      });

    return () => {
      cancelled = true;
    };
  }, [loading, navigate, token, user]);

  const onResend = () => {
    setMessage(null);
    setStatus("working");
    void requestWelcomeOrVerifyEmail({ reason: "reminder" })
      .then((result) => {
        if (result.alreadyVerified) {
          setStatus("ok");
          setMessage("Your email is already verified.");
          return;
        }
        setStatus("idle");
        setMessage(result.sent ? "Verification email sent. Check your inbox (and spam)." : "Could not send email.");
      })
      .catch((e: unknown) => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Could not send verification email");
      });
  };

  if (!isP2pConfigured()) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.h1}>Verification unavailable</h1>
          <BackButton fallback="/" className={styles.secondaryLink}>
            Back
          </BackButton>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Account</p>
        <h1 className={styles.h1}>
          {status === "ok" ? "Email verified" : status === "working" ? "Verifying…" : "Verify email"}
        </h1>
        {message ? (
          <p className={status === "error" ? `${styles.msg} ${styles.error}` : styles.lead}>{message}</p>
        ) : (
          <p className={styles.lead}>Confirming your email for buying and selling on VRNA.</p>
        )}
        <div className={styles.form} style={{ gap: "0.75rem" }}>
          {status === "ok" ? (
            <Link to="/account" className={styles.submit}>
              Go to account
            </Link>
          ) : (
            <>
              {user ? (
                <button type="button" className={styles.submit} disabled={status === "working"} onClick={onResend}>
                  Resend verification email
                </button>
              ) : null}
              <Link to="/account" className={styles.secondaryLink}>
                Account
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
