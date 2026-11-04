import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminSearchCatalog, adminUpdateCatalogProduct, type AdminCatalogRow } from "@/lib/admin-catalog";
import { stockxSizedImageUrl } from "@/lib/catalog-image-quality";
import styles from "../AdminPage.module.css";

function Thumb({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <span className={styles.listingThumbEmpty}>No photo</span>;
  return (
    <span className={styles.listingThumb} style={{ background: "#fff" }}>
      <img
        src={stockxSizedImageUrl(url, 120)}
        alt=""
        referrerPolicy="no-referrer"
        style={{ objectFit: "contain" }}
        onError={(e) => {
          if (e.currentTarget.src !== url) e.currentTarget.src = url;
          else setFailed(true);
        }}
      />
    </span>
  );
}

function PhotoEditor({ row, busy, onSave }: { row: AdminCatalogRow; busy: boolean; onSave: (url: string) => void }) {
  const [url, setUrl] = useState(row.admin_image_url ?? "");
  const gallery = [...new Set([row.featured_image_url, ...(row.image_gallery ?? [])].filter((u): u is string => Boolean(u)))];
  return (
    <div className={styles.reviewBox} style={{ marginTop: "0.75rem" }}>
      {gallery.length ? (
        <>
          <p className={styles.small}>Pick a photo from the product gallery:</p>
          <div className={styles.photoGrid}>
            {gallery.slice(0, 12).map((u) => (
              <button
                key={u}
                type="button"
                className={styles.photoLink}
                style={{ padding: 0, background: "#fff", outline: u === row.featured_image_url ? "2px solid var(--accent)" : undefined }}
                disabled={busy}
                onClick={() => onSave(u)}
              >
                <img src={stockxSizedImageUrl(u, 120)} alt="" referrerPolicy="no-referrer" style={{ objectFit: "contain" }} />
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className={styles.emailTestRow}>
        <input
          className={styles.input}
          placeholder="Or paste an image URL (https://...)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="button" className={styles.btn} disabled={busy || !url.trim()} onClick={() => onSave(url.trim())}>
          Save photo
        </button>
        {row.admin_image_url ? (
          <button type="button" className={styles.ghostBtn} disabled={busy} onClick={() => onSave("")}>
            Remove override
          </button>
        ) : null}
      </div>
      {row.admin_image_url ? (
        <p className={styles.small}>Removing the override keeps the current photo until the next catalog import refreshes it.</p>
      ) : null}
    </div>
  );
}

export function AdminCatalogPanel() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminCatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyHandle, setBusyHandle] = useState<string | null>(null);
  const [photoHandle, setPhotoHandle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void adminSearchCatalog(query)
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load products"))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(input.trim());
  };

  const update = (row: AdminCatalogRow, change: { hidden?: boolean; imageUrl?: string; featured?: boolean }) => {
    setBusyHandle(row.handle);
    setError(null);
    void adminUpdateCatalogProduct({ handle: row.handle, ...change })
      .then(() => {
        if (change.imageUrl !== undefined) setPhotoHandle(null);
        load();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not update product"))
      .finally(() => setBusyHandle(null));
  };

  return (
    <section className={styles.panel}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>Catalog</p>
        <h2 className={styles.sectionTitle}>Product tools</h2>
        <p className={styles.lead}>
          Hide a product, fix its photo, or pin it to the Staff picks row on the home page. Changes survive catalog
          imports.
        </p>
      </div>
      <form className={styles.toolbar} onSubmit={submit}>
        <input
          className={styles.search}
          placeholder="Search by title or handle (leave empty to see pinned, hidden and fixed products)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className={styles.btn} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>
      {error ? <p className={styles.warn}>{error}</p> : null}
      <div className={styles.stack}>
        {rows.map((row) => {
          const busy = busyHandle === row.handle;
          return (
            <article key={row.handle} className={styles.tradeCard}>
              <div className={styles.listingTop}>
                <Thumb url={row.featured_image_url} />
                <div className={styles.listingBody}>
                  <p className={styles.title}>
                    {row.published ? <Link to={`/product/${row.handle}`}>{row.title}</Link> : row.title}
                  </p>
                  <p className={styles.small}>
                    {row.brand ?? "No brand"} · {row.handle}
                  </p>
                  <p style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", margin: "0.4rem 0" }}>
                    {row.admin_hidden ? <span className={styles.pill}>Hidden</span> : null}
                    {!row.admin_hidden && !row.published ? <span className={styles.pill}>Unpublished</span> : null}
                    {row.featured_at ? <span className={styles.pill}>Pinned</span> : null}
                    {row.admin_image_url ? <span className={styles.pill}>Photo fixed</span> : null}
                    {!row.has_photo ? <span className={styles.pill}>No photo</span> : null}
                  </p>
                  <div className={styles.buttonRow} style={{ justifyContent: "flex-start" }}>
                    <button
                      type="button"
                      className={row.admin_hidden || !row.published ? styles.btn : styles.dangerBtn}
                      disabled={busy}
                      onClick={() => {
                        const hide = row.published;
                        if (hide && !window.confirm(`Hide "${row.title}" from the store?`)) return;
                        update(row, { hidden: hide });
                      }}
                    >
                      {row.published ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      disabled={busy || !row.published}
                      onClick={() => update(row, { featured: !row.featured_at })}
                    >
                      {row.featured_at ? "Unpin" : "Pin to home"}
                    </button>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      disabled={busy}
                      onClick={() => setPhotoHandle(photoHandle === row.handle ? null : row.handle)}
                    >
                      {photoHandle === row.handle ? "Close" : "Fix photo"}
                    </button>
                  </div>
                </div>
              </div>
              {photoHandle === row.handle ? (
                <PhotoEditor row={row} busy={busy} onSave={(url) => update(row, { imageUrl: url })} />
              ) : null}
            </article>
          );
        })}
      </div>
      {!rows.length && !loading ? (
        <p className={styles.empty}>{query ? "No products match." : "No pinned, hidden, or fixed products yet."}</p>
      ) : null}
    </section>
  );
}
