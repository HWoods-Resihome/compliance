"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { TrackerColumn, TrackerRow } from "@/lib/utilityTracker";

type RowStatus = "idle" | "saving" | "saved" | "error";
const PAY_COLS = ["electric_pay", "water_pay", "gas_pay", "trash_pay"];

export function Tracker({
  initialRows,
  columns,
  payOptions,
  error,
  configured,
  hasTable,
}: {
  initialRows: TrackerRow[];
  columns: TrackerColumn[];
  payOptions: string[];
  error: string | null;
  configured: boolean;
  hasTable: boolean;
}) {
  const [rows, setRows] = useState<TrackerRow[]>(initialRows);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [search, setSearch] = useState("");
  const [stateF, setStateF] = useState("");
  const [payF, setPayF] = useState("");
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const savedRef = useRef<Map<string, string>>(
    new Map(initialRows.map((r) => [r.id, snap(columns, r)])),
  );

  const states = useMemo(
    () => [...new Set(rows.map((r) => r.state).filter(Boolean))].sort(),
    [rows],
  );
  const providerCount = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows)
      for (const c of columns)
        if (c.kind === "provider" && r[c.name] && !/^n\/?a$|^tbd$/i.test(r[c.name]))
          s.add(r[c.name].toLowerCase());
    return s.size;
  }, [rows, columns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateF && r.state !== stateF) return false;
      if (payF && !PAY_COLS.some((p) => r[p] === payF)) return false;
      if (q && !columns.map((c) => r[c.name] || "").join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, columns, search, stateF, payF]);

  function setCell(id: string, name: string, value: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [name]: value } : r)));
  }

  async function saveRow(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const now = snap(columns, row);
    if (savedRef.current.get(id) === now) return; // unchanged
    setStatus((s) => ({ ...s, [id]: "saving" }));
    try {
      const values = Object.fromEntries(columns.map((c) => [c.name, row[c.name] ?? ""]));
      const res = await fetch(`/api/utility-tracker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (!res.ok) throw new Error();
      savedRef.current.set(id, now);
      setStatus((s) => ({ ...s, [id]: "saved" }));
      setTimeout(() => setStatus((s) => ({ ...s, [id]: "idle" })), 1500);
    } catch {
      setStatus((s) => ({ ...s, [id]: "error" }));
    }
  }

  async function addRow() {
    setAdding(true);
    try {
      const values = Object.fromEntries(columns.map((c) => [c.name, ""]));
      const res = await fetch("/api/utility-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const j = await res.json();
      if (!res.ok || !j.row) throw new Error();
      setRows((rs) => [j.row as TrackerRow, ...rs]);
      savedRef.current.set(j.row.id, snap(columns, j.row));
    } catch {
      alert("Could not add a row.");
    } finally {
      setAdding(false);
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Delete this community from the tracker?")) return;
    setStatus((s) => ({ ...s, [id]: "saving" }));
    try {
      const res = await fetch(`/api/utility-tracker/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRows((rs) => rs.filter((r) => r.id !== id));
      savedRef.current.delete(id);
    } catch {
      setStatus((s) => ({ ...s, [id]: "error" }));
      alert("Could not delete.");
    }
  }

  async function seed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/utility-tracker/setup", { method: "POST" });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      alert("Seed failed.");
      setSeeding(false);
    }
  }

  const needsSeed = configured && !error && rows.length === 0;

  return (
    <div className="app">
      {/* ── Rail ── */}
      <aside className="rail">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/resihome-logo.png" alt="ResiHome" />
        <div className="accent" />
        <div className="tagline">OPERATIONS · UTILITY TRACKER</div>

        <div className="slicer">
          <h4>Search</h4>
          <input className="railfield" placeholder="Community, provider, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="slicer">
          <h4>State</h4>
          <select className="railfield" value={stateF} onChange={(e) => setStateF(e.target.value)}>
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="slicer">
          <h4>Who pays</h4>
          <select className="railfield" value={payF} onChange={(e) => setPayF(e.target.value)}>
            <option value="">Any</option>
            {payOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="slicer">
          <button className="dd-apply" style={{ margin: 0, width: "100%" }} onClick={addRow} disabled={adding}>
            {adding ? "Adding…" : "+ Add community"}
          </button>
        </div>

        <div className="slicer">
          <h4>Reference</h4>
          <Link className="raillink" href="/utilities">Action Items →</Link>
          <Link className="raillink" href="/">Compliance home →</Link>
        </div>
      </aside>

      {/* ── Canvas ── */}
      <main className="canvas">
        <div className="pagehead">
          <h1>Utility Tracker</h1>
          <div className="ctx">
            <span className="due week">HubDB · editable</span>
            <span>{rows.length} communities</span>
          </div>
        </div>

        {!configured && <div className="banner">HubSpot isn&apos;t configured in this environment.</div>}
        {error && <div className="banner">Could not load the tracker: {error}</div>}
        {needsSeed && (
          <div className="banner demo">
            {hasTable ? "The tracker table is empty." : "The tracker table hasn't been created yet."}{" "}
            <button className="dd-link" onClick={seed} disabled={seeding} style={{ fontSize: 12 }}>
              {seeding ? "Seeding…" : "Seed the 26 communities from the sheet →"}
            </button>
          </div>
        )}

        <div className="grid kpi-row">
          <Kpi label="Communities" value={rows.length} />
          <Kpi label="States" value={states.length} />
          <Kpi label="Showing" value={filtered.length} sub={search || stateF || payF ? "filtered" : "all"} />
          <Kpi label="Distinct providers" value={providerCount} />
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="empty">
                    {rows.length === 0 ? "No rows yet." : "No communities match the filters."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  {columns.map((c) => (
                    <td key={c.name} className={`k-${c.kind}`}>
                      <input
                        className={`cell k-${c.kind}`}
                        value={r[c.name] ?? ""}
                        list={c.kind === "pay" ? "pay-options" : undefined}
                        onChange={(e) => setCell(r.id, c.name, e.target.value)}
                        onBlur={() => saveRow(r.id)}
                        spellCheck={false}
                      />
                    </td>
                  ))}
                  <td className="rowactions">
                    <RowStatusBadge status={status[r.id] ?? "idle"} />
                    <button className="delbtn" title="Delete row" onClick={() => deleteRow(r.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="pay-options">
          {payOptions.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
          Edits save to HubDB on blur (no spreadsheet). Add or delete communities from the rail /
          row. Source tab: &ldquo;DRC &amp; 3RD PARTY Community Info.&rdquo;
        </p>
      </main>
    </div>
  );
}

function snap(columns: TrackerColumn[], r: TrackerRow): string {
  return JSON.stringify(columns.map((c) => r[c.name] ?? ""));
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
