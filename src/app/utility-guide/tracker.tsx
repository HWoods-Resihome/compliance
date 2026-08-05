"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SheetMeta, TrackerColumn, TrackerRow } from "@/lib/utilityTracker";

type RowStatus = "idle" | "saving" | "saved" | "error";

const isUrl = (v: string) => /^https?:\/\//i.test(v.trim());
const snap = (cols: TrackerColumn[], r: TrackerRow) => JSON.stringify(cols.map((c) => r[c.name] ?? ""));
const key = (sheet: string, id: string) => `${sheet}:${id}`;

export function Tracker({
  sheets,
  defaultSheet,
  initialRows,
  payOptions,
  error,
  configured,
}: {
  sheets: SheetMeta[];
  defaultSheet: string;
  initialRows: TrackerRow[];
  payOptions: string[];
  error: string | null;
  configured: boolean;
}) {
  const [active, setActive] = useState(defaultSheet);
  const [rowsBySheet, setRowsBySheet] = useState<Record<string, TrackerRow[]>>({ [defaultSheet]: initialRows });
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [loadErr, setLoadErr] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [search, setSearch] = useState("");
  const [stateF, setStateF] = useState("");
  const [payF, setPayF] = useState("");
  const [portfolioF, setPortfolioF] = useState("");
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const savedRef = useRef<Map<string, string>>(new Map());

  const sheet = useMemo(() => sheets.find((s) => s.key === active)!, [sheets, active]);
  const columns = sheet.columns;
  const rows = rowsBySheet[active] ?? [];
  const hasState = columns.some((c) => c.kind === "state");
  const hasPay = columns.some((c) => c.kind === "pay");
  const hasPortfolio = columns.some((c) => c.name === "portfolio");
  const payCols = useMemo(() => columns.filter((c) => c.kind === "pay").map((c) => c.name), [columns]);
  const providerCols = useMemo(() => columns.filter((c) => c.kind === "provider").map((c) => c.name), [columns]);

  // seed savedRef for the initial (server-rendered) sheet
  useEffect(() => {
    const cols = sheets.find((s) => s.key === defaultSheet)!.columns;
    for (const r of initialRows) savedRef.current.set(key(defaultSheet, r.id), snap(cols, r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lazy-load a sheet's rows on first visit
  useEffect(() => {
    if (sheet.locked || rowsBySheet[active] || loading[active]) return;
    let cancel = false;
    setLoading((s) => ({ ...s, [active]: true }));
    fetch(`/api/utility-tracker/${active}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        const rs: TrackerRow[] = j.rows ?? [];
        setRowsBySheet((m) => ({ ...m, [active]: rs }));
        for (const r of rs) savedRef.current.set(key(active, r.id), snap(columns, r));
        if (j.error) setLoadErr((e) => ({ ...e, [active]: j.detail || j.error }));
      })
      .catch(() => !cancel && setLoadErr((e) => ({ ...e, [active]: "Could not load this sheet." })))
      .finally(() => !cancel && setLoading((s) => ({ ...s, [active]: false })));
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function switchSheet(k: string) {
    setActive(k);
    setSearch("");
    setStateF("");
    setPayF("");
    setPortfolioF("");
  }

  const states = useMemo(() => [...new Set(rows.map((r) => r.state).filter(Boolean))].sort(), [rows]);
  const portfolios = useMemo(() => [...new Set(rows.map((r) => r.portfolio).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (hasState && stateF && r.state !== stateF) return false;
      if (hasPortfolio && portfolioF && r.portfolio !== portfolioF) return false;
      if (hasPay && payF && !payCols.some((p) => r[p] === payF)) return false;
      if (q && !columns.map((c) => r[c.name] || "").join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, columns, search, stateF, payF, portfolioF, hasState, hasPay, hasPortfolio, payCols]);

  const providerCount = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows)
      for (const c of providerCols) if (r[c] && !/^n\/?a$|^tbd$/i.test(r[c])) s.add(r[c].toLowerCase());
    return s.size;
  }, [rows, providerCols]);

  // ── mutations ───────────────────────────────────────────────────────────────
  function setCell(id: string, name: string, value: string) {
    setRowsBySheet((m) => ({ ...m, [active]: (m[active] ?? []).map((r) => (r.id === id ? { ...r, [name]: value } : r)) }));
  }

  async function saveRow(id: string) {
    const row = (rowsBySheet[active] ?? []).find((r) => r.id === id);
    if (!row) return;
    const now = snap(columns, row);
    if (savedRef.current.get(key(active, id)) === now) return;
    setStatus((s) => ({ ...s, [key(active, id)]: "saving" }));
    try {
      const values = Object.fromEntries(columns.map((c) => [c.name, row[c.name] ?? ""]));
      const res = await fetch(`/api/utility-tracker/${active}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (!res.ok) throw new Error();
      savedRef.current.set(key(active, id), now);
      setStatus((s) => ({ ...s, [key(active, id)]: "saved" }));
      setTimeout(() => setStatus((s) => ({ ...s, [key(active, id)]: "idle" })), 1400);
    } catch {
      setStatus((s) => ({ ...s, [key(active, id)]: "error" }));
    }
  }

  async function addRow() {
    setAdding(true);
    try {
      const values = Object.fromEntries(columns.map((c) => [c.name, ""]));
      const res = await fetch(`/api/utility-tracker/${active}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const j = await res.json();
      if (!res.ok || !j.row) throw new Error();
      setRowsBySheet((m) => ({ ...m, [active]: [j.row as TrackerRow, ...(m[active] ?? [])] }));
      savedRef.current.set(key(active, j.row.id), snap(columns, j.row));
    } catch {
      alert("Could not add a row.");
    } finally {
      setAdding(false);
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Delete this row?")) return;
    setStatus((s) => ({ ...s, [key(active, id)]: "saving" }));
    try {
      const res = await fetch(`/api/utility-tracker/${active}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRowsBySheet((m) => ({ ...m, [active]: (m[active] ?? []).filter((r) => r.id !== id) }));
      savedRef.current.delete(key(active, id));
    } catch {
      setStatus((s) => ({ ...s, [key(active, id)]: "error" }));
      alert("Could not delete.");
    }
  }

  async function seedActive() {
    setSeeding(true);
    try {
      const res = await fetch("/api/utility-tracker/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet: active }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      const r = await fetch(`/api/utility-tracker/${active}`).then((x) => x.json());
      const rs: TrackerRow[] = r.rows ?? [];
      setRowsBySheet((m) => ({ ...m, [active]: rs }));
      for (const row of rs) savedRef.current.set(key(active, row.id), snap(columns, row));
      if (!rs.length) alert(`Seeded ${j.results?.[0]?.seeded ?? 0} rows.`);
    } catch {
      alert("Seed failed.");
    } finally {
      setSeeding(false);
    }
  }

  // ── grouped nav ───────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const order: string[] = [];
    const by: Record<string, SheetMeta[]> = {};
    for (const s of sheets) {
      if (!by[s.group]) {
        by[s.group] = [];
        order.push(s.group);
      }
      by[s.group].push(s);
    }
    return order.map((g) => ({ group: g, items: by[g] }));
  }, [sheets]);

  const isLoading = loading[active];
  const needsSeed = configured && !error && !sheet.locked && !isLoading && rows.length === 0;

  return (
    <div className="app">
      {/* ── Rail ── */}
      <aside className="rail">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/resihome-logo.png" alt="ResiHome" />
        <div className="accent" />
        <div className="tagline">OPERATIONS · UTILITY TRACKER</div>

        <div className="slicer">
          <h4>Master document</h4>
          <nav className="sheetnav">
            {groups.map(({ group, items }) => (
              <div key={group} className="sheetgroup">
                <div className="sheetgroup-h">{group}</div>
                {items.map((s) => (
                  <button
                    key={s.key}
                    className={`sheetbtn${s.key === active ? " on" : ""}${s.locked ? " locked" : ""}`}
                    onClick={() => switchSheet(s.key)}
                  >
                    {s.locked ? "🔒 " : ""}
                    {s.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {!sheet.locked && (
          <>
            <div className="slicer">
              <h4>Search</h4>
              <input className="railfield" placeholder="Search this sheet…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {hasState && (
              <div className="slicer">
                <h4>State</h4>
                <select className="railfield" value={stateF} onChange={(e) => setStateF(e.target.value)}>
                  <option value="">All states</option>
                  {states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            {hasPortfolio && (
              <div className="slicer">
                <h4>Portfolio</h4>
                <select className="railfield" value={portfolioF} onChange={(e) => setPortfolioF(e.target.value)}>
                  <option value="">All portfolios</option>
                  {portfolios.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
            {hasPay && (
              <div className="slicer">
                <h4>Who pays</h4>
                <select className="railfield" value={payF} onChange={(e) => setPayF(e.target.value)}>
                  <option value="">Any</option>
                  {payOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="slicer">
              <button className="dd-apply" style={{ margin: 0, width: "100%" }} onClick={addRow} disabled={adding}>
                {adding ? "Adding…" : "+ Add row"}
              </button>
            </div>
          </>
        )}

        <div className="slicer">
          <h4>Reference</h4>
          <Link className="raillink" href="/utilities">Action Items →</Link>
          <Link className="raillink" href="/">Compliance home →</Link>
        </div>
      </aside>

      {/* ── Canvas ── */}
      <main className="canvas">
        <div className="pagehead">
          <h1>{sheet.label}</h1>
          <div className="ctx">
            <span className="due week">HubDB · editable</span>
            {!sheet.locked && <span>{rows.length} rows</span>}
          </div>
        </div>
        <p className="sheetblurb">{sheet.blurb}</p>

        {!configured && <div className="banner">HubSpot isn&apos;t configured in this environment.</div>}
        {error && <div className="banner">Could not load the tracker: {error}</div>}
        {loadErr[active] && <div className="banner">Could not load this sheet: {loadErr[active]}</div>}
        {needsSeed && (
          <div className="banner demo">
            This sheet is empty.{" "}
            <button className="dd-link" onClick={seedActive} disabled={seeding} style={{ fontSize: 12 }}>
              {seeding ? "Seeding…" : "Seed it from the spreadsheet →"}
            </button>
          </div>
        )}

        {sheet.locked ? (
          <LockedCard />
        ) : (
          <>
            <div className="grid kpi-row">
              <Kpi label="Rows" value={rows.length} />
              <Kpi label="Showing" value={filtered.length} sub={search || stateF || payF || portfolioF ? "filtered" : "all"} />
              {hasState && <Kpi label="States" value={states.length} />}
              {hasPortfolio && <Kpi label="Portfolios" value={portfolios.length} />}
              {providerCols.length > 0 && <Kpi label="Distinct providers" value={providerCount} />}
              <Kpi label="Source" value="HubDB" sub="off the spreadsheet" small />
            </div>

            <div className="tbl-wrap" style={{ marginTop: 12 }}>
              <table className="tbl tracker">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.name} className={`k-${c.kind}`}>{c.label}</th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={columns.length + 1} className="empty">Loading…</td>
                    </tr>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 1} className="empty">
                        {rows.length === 0 ? "No rows yet." : "No rows match the filters."}
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    filtered.map((r) => (
                      <tr key={r.id}>
                        {columns.map((c) => (
                          <td key={c.name} className={`k-${c.kind}`}>
                            <Cell col={c} value={r[c.name] ?? ""} onChange={(v) => setCell(r.id, c.name, v)} onCommit={() => saveRow(r.id)} />
                          </td>
                        ))}
                        <td className="rowactions">
                          <RowStatusBadge status={status[key(active, r.id)] ?? "idle"} />
                          <button className="delbtn" title="Delete row" onClick={() => deleteRow(r.id)}>✕</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Edits save to HubDB on change (no spreadsheet). Passwords are never stored here — see the 🔒 Provider Passwords tab.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

// ── Cell ──────────────────────────────────────────────────────────────────────
function Cell({
  col,
  value,
  onChange,
  onCommit,
}: {
  col: TrackerColumn;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  if (col.options && col.options.length) {
    // preserve a current value that isn't in the canonical option list
    const opts = [...col.options];
    if (value && !opts.includes(value)) opts.push(value);
    return (
      <select
        className={`cell sel k-${col.kind}`}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setTimeout(onCommit, 0);
        }}
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (col.kind === "longtext") {
    return (
      <textarea
        className={`cell area k-${col.kind}`}
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        spellCheck={false}
      />
    );
  }
  if (col.kind === "link") {
    return (
      <div className="linkcell">
        <input className={`cell k-${col.kind}`} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onCommit} spellCheck={false} />
        {isUrl(value) && (
          <a className="linkopen" href={value.trim()} target="_blank" rel="noreferrer" title="Open link">↗</a>
        )}
      </div>
    );
  }
  return (
    <input className={`cell k-${col.kind}`} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onCommit} spellCheck={false} />
  );
}

function LockedCard() {
  return (
    <div className="lockcard">
      <div className="lockicon">🔒</div>
      <h3>Provider credentials are intentionally excluded</h3>
      <p>
        The spreadsheet&apos;s <strong>PROVIDER PASSWORDS</strong> tab is not stored in this application. Portal
        usernames and websites are kept alongside each community (see the login-reference columns), but passwords are
        vaulted separately and never committed to this codebase or HubDB.
      </p>
      <p className="muted">Keep passwords in your secrets manager (e.g. 1Password / the Conservice login manager).</p>
    </div>
  );
}

function Kpi({ label, value, sub, small }: { label: string; value: number | string; sub?: string; small?: boolean }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value" style={small ? { fontSize: 16 } : undefined}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function RowStatusBadge({ status }: { status: RowStatus }) {
  if (status === "saving") return <span className="rowsave saving">saving…</span>;
  if (status === "saved") return <span className="rowsave saved">saved ✓</span>;
  if (status === "error") return <span className="rowsave err">error</span>;
  return <span className="rowsave" />;
}
