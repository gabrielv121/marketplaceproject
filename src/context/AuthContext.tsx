import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isP2pConfigured } from "@/lib/supabase";

type AuthResult = { error: Error | null; session: Session | null };

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<{ error: Error | null }>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signUpWithPassword: (email: string, password: string, displayName?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isP2pConfigured()) {
      setSession(null);
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }

    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const sb = getSupabase();
    if (!sb) return { error: new Error("Supabase not configured") };
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const sb = getSupabase();
    if (!sb) return { error: new Error("Supabase not configured"), session: null };
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (data.session) setSession(data.session);
    return { error: error ? new Error(error.message) : null, session: data.session ?? null };
  }, []);

  const signUpWithPassword = useCallback(
    async (email: string, password: string, displayName?: string): Promise<AuthResult> => {
      const sb = getSupabase();
      if (!sb) return { error: new Error("Supabase not configured"), session: null };
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: displayName?.trim() ? { display_name: displayName.trim() } : undefined,
          emailRedirectTo: `${window.location.origin}/account`,
        },
      });
      if (data.session) setSession(data.session);
      return { error: error ? new Error(error.message) : null, session: data.session ?? null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signInWithEmail,
      signInWithPassword,
      signUpWithPassword,
      signOut,
    }),
    [session, loading, signInWithEmail, signInWithPassword, signOut, signUpWithPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook co-located with provider; Fast Refresh expects components-only in default setup. */
// eslint-disable-next-line react-refresh/only-export-components -- useAuth is the public API for this module
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
