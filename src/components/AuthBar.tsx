import { Link, NavLink, useNavigate } from "react-router-dom";
import { IconLogOut, IconUser } from "@/components/HeaderIcons";
import { useAuth } from "@/context/AuthContext";
import { isP2pConfigured } from "@/lib/supabase";
import styles from "./AuthBar.module.css";

export type AuthBarVariant = "header" | "menu";

type AuthBarProps = {
  variant?: AuthBarVariant;
  /** Called after sign out (e.g. close mobile menu). */
  onDismiss?: () => void;
};

export function AuthBar({ variant = "header", onDismiss }: AuthBarProps) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const menu = variant === "menu";

  const onSignOut = () => {
    void signOut().then(() => {
      onDismiss?.();
      navigate("/");
    });
  };

  if (!isP2pConfigured()) {
    if (menu) {
      return (
        <div className={styles.wrapMenu}>
          <Link to="/account" className={styles.menuAccountLink} onClick={onDismiss}>
            Account
          </Link>
          <Link to="/login" className={styles.menuLoginLink} onClick={onDismiss}>
            Sign in
          </Link>
        </div>
      );
    }
    return (
      <div className={styles.wrap}>
        <Link to="/account" className={styles.loginBtn}>
          Account
        </Link>
        <Link to="/login" className={styles.loginBtn}>
          Sign in
        </Link>
      </div>
    );
  }

  if (loading) {
    return <span className={menu ? styles.loadingMenu : styles.wrap}>Session…</span>;
  }

  if (user?.email) {
    if (menu) {
      return (
        <div className={styles.wrapMenu}>
          <div className={styles.userBlockMenu} title={user.id}>
            <IconUser className={styles.leadIconMenu} width={20} height={20} aria-hidden />
            <span className={styles.emailMenu}>{user.email}</span>
          </div>
          <Link to="/account" className={styles.menuAccountLink}>
            Account
          </Link>
          <button
            type="button"
            className={styles.menuSignOutBtn}
            onClick={onSignOut}
          >
            <IconLogOut className={styles.linkIcon} width={18} height={18} aria-hidden />
            Sign out
          </button>
        </div>
      );
    }

    return (
      <div className={styles.wrap}>
        <NavLink
          to="/account"
          className={({ isActive }) =>
            isActive ? `${styles.accountIconBtn} ${styles.accountIconBtnActive}` : styles.accountIconBtn
          }
          end
          aria-label="Account"
          title={user.email ?? undefined}
        >
          <IconUser className={styles.accountIconGlyph} width={20} height={20} aria-hidden />
        </NavLink>
        <button type="button" className={styles.signOutBtn} onClick={onSignOut}>
          <IconLogOut className={styles.linkIcon} width={15} height={15} aria-hidden />
          Sign out
        </button>
      </div>
    );
  }

  if (menu) {
    return (
      <Link to="/login" className={styles.menuLoginLink} onClick={onDismiss}>
        Sign in
      </Link>
    );
  }

  return (
    <Link to="/login" className={styles.loginBtn}>
      Sign in
    </Link>
  );
}
