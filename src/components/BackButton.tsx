import type { ReactNode } from "react";
import { useNavigateBack } from "@/lib/navigation";

type BackButtonProps = {
  /** Where to go if there is no in-app history (direct link, new tab). */
  fallback?: string;
  className?: string;
  children?: ReactNode;
};

export function BackButton({ fallback = "/", className, children = "Back" }: BackButtonProps) {
  const goBack = useNavigateBack(fallback);
  return (
    <button type="button" className={className} onClick={goBack}>
      {children}
    </button>
  );
}
