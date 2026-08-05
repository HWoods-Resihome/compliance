"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dataset from "@/data/hoa-homes.json";

type Row = {
  entityId: string;
  address: string;
  zip: string | null;
  state: string;
  hoaId: string;
  hoaName: string | null;
  hoaStatus: string | null;
  mgmtCompany: string | null;
  assessmentAmount: number | null;
  periodicity: string;
  annualAssessment: number | null;
  lastPaid: string;
  paidThrough: string | null;
  fy26Status: string;
  fy26Due: string | null;
  fy26SettlementDate: string | null;
  category: "active" | "flagged" | "dropped";
  outstanding: boolean;
};

const ROWS = dataset.rows as Row[];
const META = dataset.meta as {
  counts: { links: number; homes: number; hoas: number; droppedHomes: number };
};

const ALL = "All";

function uniqSorted(values: (string | null | undefined)[], order?: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").trim();
    if (s) set.add(s);
  }
  const arr = Array.from(set);
  if (order) {
    return arr.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }
  return arr.sort((a, b) => a.localeCompare(b));
}

function val(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function money(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const FY_ORDER = ["FY27", "FY26", "FY25", "FY24", "FY23", "FY22", "FY21"];
const PERIODICITY_ORDER = ["Monthly", "Quarterly", "Semi-Annually", "Annually", "Voluntary"];
const FLAGGED_STATUSES = ["Dissolved", "Voluntary", "Inactive", "NonHOAPayment"];

export default function HoaHomesPage() {
  const [q, setQ] = useState("");
  const [state, setState] = useState(ALL);
  const [periodicity, setPeriodicity] = useState(ALL);
  const [lastPaid, setLastPaid] = useState(ALL);
  const [payment, setPayment] = useState(ALL); // All | Outstanding | Paid
  const [category, setCategory] = useState("Billing"); // Billing | Active | Flagged | Dropped | All
  const [hoaFilter, setHoaFilter] = useState<string | null>(null); // hoaId

  const states = useMemo(() => uniqSorted(ROWS.map((r) => r.state)), []);
  const periodicities = useMemo(
    () => uniqSorted(ROWS.map((r) => r.periodicity), PERIODICITY_ORDER),
    [],
  );
  const lastPaids = useMemo(() => uniqSorted(ROWS.map((r) => r.lastPaid), FY_ORDER), []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ROWS.filter((r) => {
      if (hoaFilter && r.hoaId !== hoaFilter) return false;
      if (category === "Billing" && r.category === "dropped") return false;
      else if (category === "Active" && r.category !== "active") return false;
      else if (category === "Flagged" && r.category !== "flagged") return false;
      else if (category === "Dropped" && r.category !== "dropped") return false;
      if (state !== ALL && r.state !== state) return false;
      if (periodicity !== ALL && r.periodicity !== periodicity) return false;
      if (lastPaid !== ALL && r.lastPaid !== lastPaid) return false;
      if (payment === "Outstanding" && !r.outstanding) return false;
      if (payment === "Paid" && r.fy26Status !== "Paid") return false;
      if (needle) {
        const hay = `${r.address} ${r.entityId} ${r.hoaName ?? ""} ${r.hoaId} ${r.mgmtCompany ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [q, state, periodicity, lastPaid, payment, category, hoaFilter]);

  const activeHoa = hoaFilter ? ROWS.find((r) => r.hoaId === hoaFilter) : null;
  const distinctHomes = useMemo(() => new Set(filtered.map((r) => r.entityId)).size, [filtered]);
  const distinctHoas = useMemo(() => new Set(filtered.map((r) => r.hoaId)).size, [filtered]);
  const outstandingCount = useMemo(() => filtered.filter((r) => r.outstanding).length, [filtered]);
  const anyFilter =
    !!q || state !== ALL || periodicity !== ALL || lastPaid !== ALL || payment !== ALL || category !== "Billing" || !!hoaFilter;

  function reset() {
    setQ("");
    setState(ALL);
    setPeriodicity(ALL);
    setLastPaid(ALL);
    setPayment(ALL);
    setCategory("Billing");
    setHoaFilter(null);
  }

  function exportCsv() {
    const cols: (keyof Row)[] = [
      "entityId", "address", "state", "zip", "hoaId", "hoaName", "hoaStatus",
      "mgmtCompany", "assessmentAmount", "periodicity", "annualAssessment",
      "lastPaid", "paidThrough", "fy26Status", "fy26SettlementDate", "category",
    ];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(",")];
    for (const r of filtered) lines.push(cols.map((c) => esc(r[c])).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hoa-homes-filtered.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      {/* ── Rail ── */}
      <aside className="rail">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/resihome-logo.png" alt="ResiHome" />
        <div className="accent" />
        <div className="tagline">OPERATIONS · HOA HOMES</div>

        <div className="slicer">
          <h4>Search</h4>
          <input
            className="railfield"
            placeholder="Address, entity, HOA, mgmt co…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="slicer">
          <h4>State</h4>
          <select className="railfield" value={state} onChange={(e) => setState(e.target.value)}>
            <option>{ALL}</option>
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="slicer">
          <h4>Periodicity</h4>
          <select className="railfield" value={periodicity} onChange={(e) => setPeriodicity(e.target.value)}>
            <option>{ALL}</option>
            {periodicities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="slicer">
          <h4>Last paid (fiscal year)</h4>
          <select className="railfield" value={lastPaid} onChange={(e) => setLastPaid(e.target.value)}>
            <option>{ALL}</option>
            {lastPaids.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="slicer">
          <h4>FY26 payment</h4>
          <select className="railfield" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option>{ALL}</option>
            <option>Outstanding</option>
            <option>Paid</option>
          </select>
        </div>

        <div className="slicer">
          <h4>Record set</h4>
          <select className="railfield" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>Billing</option>
            <option>Active</option>
            <option>Flagged</option>
            <option>Dropped</option>
            <option>{ALL}</option>
          </select>
        </div>

        {activeHoa && (
          <div className="slicer">
            <h4>HOA filter</h4>
            <div className="hoa-active">
              <span>{activeHoa.hoaName || `HOA ${activeHoa.hoaId}`}</span>
              <button className="dd-link" onClick={() => setHoaFilter(null)}>
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="slicer">
          <button className="dd-apply" style={{ margin: "0 0 8px", width: "100%" }} onClick={exportCsv}>
            ⭳ Export CSV
          </button>
          <button className="dd-clear" style={{ marginTop: 0 }} onClick={reset} disabled={!anyFilter}>
            Reset filters
          </button>
        </div>

        <div className="slicer">
          <h4>Reference</h4>
          <Link className="raillink" href="/associations">Associations (HOA) →</Link>
          <Link className="raillink" href="/">Compliance home →</Link>
        </div>
      </aside>

      {/* ── Canvas ── */}
      <main className="canvas">
        <div className="pagehead">
          <h1>HOA Homes — FY26 Assessments</h1>
          <div className="ctx">
            <span className="due week">ResiAIMS · Snowflake</span>
            <span>{META.counts.homes.toLocaleString()} homes · {META.counts.hoas.toLocaleString()} billing HOAs</span>
          </div>
        </div>
        <p className="sheetblurb">
          Every active, HOA-mapped home and its FY26 assessment status. Filter by state, billing
          periodicity, last fiscal year paid, or outstanding balance — or click any HOA to see all
          homes in that association.
        </p>

        <div className="grid kpi-row">
          <Kpi label="Homes shown" value={distinctHomes} sub={anyFilter ? "filtered" : "all billing"} />
          <Kpi label="HOAs shown" value={distinctHoas} />
          <Kpi label="Home–HOA links" value={filtered.length} />
          <Kpi
            label="Outstanding (FY26)"
            value={outstandingCount}
            sub="no FY26 payment"
            tone={outstandingCount > 0 ? "warn" : "good"}
          />
          <Kpi label="States" value={new Set(filtered.map((r) => r.state).filter(Boolean)).size} />
        </div>

        <div className="tbl-wrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Home Address</th>
                <th>Entity ID</th>
                <th>State</th>
                <th>HOA</th>
                <th>HOA Status</th>
                <th className="num">Assessment</th>
                <th>Periodicity</th>
                <th>Last Paid</th>
                <th>FY26 Status</th>
                <th>FY26 Settled</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.entityId}-${r.hoaId}-${i}`}>
                  <td className="wrap">{val(r.address)}</td>
                  <td>{val(r.entityId)}</td>
                  <td>{val(r.state)}</td>
                  <td>
                    <button
                      className="hoa-link"
                      title="Show all homes in this HOA"
                      onClick={() => setHoaFilter(r.hoaId)}
                    >
                      {r.hoaName || `HOA ${r.hoaId}`}
                    </button>
                  </td>
                  <td>
                    <StatusBadge status={r.hoaStatus} />
                  </td>
                  <td className="num">{money(r.assessmentAmount)}</td>
                  <td>{val(r.periodicity)}</td>
                  <td>{val(r.lastPaid)}</td>
                  <td>
                    <PayBadge status={r.fy26Status} outstanding={r.outstanding} />
                  </td>
                  <td>{fmtDate(r.fy26SettlementDate)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty">
                    No homes match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
          FY26 payment status derived from ResiAIMS assessment charges and cleared/issued payments.
          &ldquo;Outstanding&rdquo; = a billing HOA with no FY26 payment recorded. &ldquo;Dropped&rdquo;
          homes have only non-billing HOA links (0 assessment, no charge history) and are excluded from
          the billing set.
        </p>
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "warn" | "good" | "bad";
}) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={`value${tone ? " " + tone : ""}`}>{value.toLocaleString()}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").trim();
  if (!s) return <span className="muted">—</span>;
  const flagged = FLAGGED_STATUSES.includes(s);
  return <span className={`due ${flagged ? "later" : "week"}`}>{s}</span>;
}

function PayBadge({ status, outstanding }: { status: string; outstanding: boolean }) {
  if (status === "Paid") return <span className="due paid">Paid</span>;
  if (outstanding) return <span className="due overdue">Outstanding</span>;
  return <span className="muted">{status || "—"}</span>;
}
