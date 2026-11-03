import { useCallback, useEffect, useMemo, useState } from "react";
import { sinceForRange, type AdminDateRange } from "@/lib/admin-analytics";
import { clearClientErrors, fetchClientErrors, type ClientErrorRow } from "@/lib/error-reporting";
import styles from "../AdminPage.module.css";

type Group = { key: string; sample: ClientErrorRow; count: number; users: number; lastAt: string; paths: string[] };

function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

/** Groups identical errors so one bug hitting many visitors shows up as one row with a count. */
function groupErrors(rows: ClientErrorRow[]): Group[] {
  const groups = new Map<string, Group & { userIds: Set<string>; pathSet: Set<string> }>();
  for (const row of rows) {
    const key = `${row.kind}|${row.message}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, sample: row, count: 0, users: 0, lastAt: row.created_at, paths: [], userIds: new Set(), pathSet: new Set() };
      groups.set(key, g);
    }
    g.count += 1;
    if (row.user_id) g.userIds.add(row.user_id);
    if (row.path) g.pathSet.add(row.path.split("?")[0]);
    if (row.created_at > g.lastAt) g.lastAt = row.created_at;
  }
  return [...groups.values()]
    .map((g) => ({ ...g, users: g.userIds.size, paths: [...g.pathSet].slice(0, 5) }))
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

export function AdminErrorsPanel({ range }: { range: AdminDateRange }) {
  const [rows, setRows] = useState<ClientErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchClientErrors(sinceForRange(range))
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load errors"))
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => groupErrors(rows), [rows]);

  const onClear = () => {
    if (!window.confirm("Delete all logged errors?")) return;
    void clearClientErrors()
      .then(load)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not clear errors"));
  };

  return (
    <section className={styles.panel}>
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>Monitoring</p>
        <h2 className={styles.sectionTitle}>Site errors</h2>
        <p className={styles.lead}>
          {rows.length} browser errors in range, {groups.length} distinct. Kept for 30 days.
        </p>
      </div>
      <div className={styles.toolbar}>
        <button type="button" className={styles.btn} disabled={loading} onClick={load}>
          {loading ? "Loading..." : "Refresh"}
        </button>
        <button type="button" className={styles.btn} disabled={loading || !rows.length} onClick={onClear}>
          Clear all
        </button>
      </div>
      {error ? <p className={styles.warn}>{error}</p> : null}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Error</th>
            <th>Count</th>
            <th>Users</th>
            <th>Last seen</th>
            <th>Pages</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key} onClick={() => setOpenKey(openKey === g.key ? null : g.key)} style={{ cursor: "pointer" }}>
              <td>
                <span className={styles.pill}>{g.sample.kind}</span> {g.sample.message}
                {openKey === g.key ? (
                  <pre className={styles.small} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8 }}>
                    {g.sample.stack ?? "No stack trace"}
                    {"\n\n"}
                    {g.sample.user_agent ?? ""}
                    {g.sample.release ? `\nRelease ${g.sample.release}` : ""}
                  </pre>
                ) : null}
              </td>
              <td>{g.count}</td>
              <td>{g.users}</td>
              <td>{shortDate(g.lastAt)}</td>
              <td className={styles.small}>{g.paths.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!groups.length && !loading ? <p className={styles.empty}>No errors logged in this range.</p> : null}
    </section>
  );
}
