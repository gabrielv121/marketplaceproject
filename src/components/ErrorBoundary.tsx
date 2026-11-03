import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "@/lib/error-reporting";

type Props = { children: ReactNode; fallbackClassName?: string };
type State = { error: Error | null };

const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch dynamically/i;
const CHUNK_RELOAD_KEY = "vrna:chunk-reload";

/** Catches render crashes in the page area; a stale deploy (missing lazy chunk) reloads once instead. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (CHUNK_ERROR.test(error.message)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
      } catch {
        /* storage blocked: fall through and show the message */
      }
    }
    reportClientError("react", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.fallbackClassName} role="alert">
        <p>Something went wrong loading this page.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
