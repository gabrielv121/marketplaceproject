import { Link, useLocation, type LinkProps } from "react-router-dom";
import { returnToState } from "@/lib/navigation";

/** In-app link that records the current page so Back can return here. */
export function ReturnLink({ to, state, ...rest }: LinkProps) {
  const location = useLocation();
  const backState = returnToState(location);
  const merged =
    state && typeof state === "object" && !Array.isArray(state)
      ? { ...backState, ...(state as Record<string, unknown>) }
      : backState;
  return <Link to={to} state={merged} {...rest} />;
}
