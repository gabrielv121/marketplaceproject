import { useEffect } from "react";

const DEFAULT_TITLE = "VRNA — Verified sneakers & streetwear";
const DEFAULT_DESCRIPTION =
  "Buy and sell sneakers and streetwear on VRNA. Peer listings, verified authentication, and secure checkout.";

function setMetaDescription(content: string) {
  let el = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    el = document.createElement("meta");
    el.name = "description";
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Sets the tab title and meta description while the page is mounted; pass null to keep the defaults. */
export function useDocumentMeta(title: string | null, description?: string | null) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} | VRNA`;
    setMetaDescription(description || DEFAULT_DESCRIPTION);
    return () => {
      document.title = DEFAULT_TITLE;
      setMetaDescription(DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
