import Link from "next/link";
import {
  getCtaBoard,
  GROUP_DIMENSIONS,
  type GroupDimension,
  type CtaItem,
  type CtaResult,
} from "@/lib/cta";
import {
  PIPELINES,
  PIPELINE_COUNT,
  STAGE_COUNT,
  pipelinesByCategory,
  monitoredPipelineIds,
} from "@/lib/pipelines";
import { GroupByDropdown, PipelinesDropdown, DemoToggle } from "./controls";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALL_IDS = PIPELINES.map((p) => p.id);
const GROUP_KEYS = new Set(GROUP_DIMENSIONS.map((g) => g.key));
const CATALOG = pipelinesByCategory().map((c) => ({
  category: c.category,
  pipelines: c.pipelines.map((p) => ({ id: p.id, label: p.label, stages: p.stages.length })),
}));

type State = { pipelines: string[]; groupBy: GroupDimension; demo: boolean };

function hrefWith(s: Partial<State>, base: State): string {
  const pipelines = s.pipelines ?? base.pipelines;
  const groupBy = s.groupBy ?? base.groupBy;
  const demo = s.demo ?? base.demo;
  const params = new URLSearchParams();
  const def = monitoredPipelineIds();
  const same = pipelines.length === def.length && pipelines.every((id) => def.includes(id));
  if (!same) params.set("pipelines", pipelines.join(","));
  if (groupBy !== "pipeline") params.set("groupBy", groupBy);
  if (demo) params.set("demo", "1");
  const qs = params.toString();
  return `/utilities${qs ? `?${qs}` : ""}`;
}

export default async function UtilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ pipelines?: string; groupBy?: string; demo?: string }>;
}) {
  const sp = await searchParams;
  const demo = sp.demo === "1" || sp.demo === "true";
  const groupBy: GroupDimension =
    sp.groupBy && GROUP_KEYS.has(sp.groupBy as GroupDimension)
      ? (sp.groupBy as GroupDimension)
      : "pipeline";
  const pipelines =
    sp.pipelines && sp.pipelines.trim()
      ? sp.pipelines.split(",").map((s) => s.trim()).filter((id) => ALL_IDS.includes(id))
      : monitoredPipelineIds();

  const base: State = { pipelines, groupBy, demo };
  const defaults = monitoredPipelineIds();
  const dimLabel = GROUP_DIMENSIONS.find((d) => d.key === groupBy)?.label ?? groupBy;

  let board: CtaResult | null = null;
  let errorMessage: string | null = null;
  try {
    board = await getCtaBoard({ pipelineIds: pipelines, groupBy, demo });
  } catch (err) {
    errorMessage = (err as Error).message;
  }

  return (
    <div className="app">
      {/* ── Rail (dropdown controls) ── */}
      <aside className="rail">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/resihome-logo.png" alt="ResiHome" />
        <div className="accent" />
        <div className="tagline">OPERATIONS · ACTION ITEMS</div>

        <div className="slicer">
          <h4>Group by</h4>
          <GroupByDropdown dims={GROUP_DIMENSIONS} base={base} defaults={defaults} allIds={ALL_IDS} />
        </div>

        <div className="slicer">
          <h4>Monitored pipelines</h4>
          <PipelinesDropdown catalog={CATALOG} base={base} defaults={defaults} allIds={ALL_IDS} />
        </div>

        <div className="slicer">
          <h4>View</h4>
          <DemoToggle base={base} defaults={defaults} allIds={ALL_IDS} />
          <p className="railnote">
            {pipelines.length} of {PIPELINE_COUNT} pipelines · {STAGE_COUNT} stages total.
            Grouping by portfolio / organization / owner / region / state / address reads
            each ticket&apos;s fields (address parsed for state).
          </p>
        </div>

        <div className="slicer">
          <h4>Reference</h4>
          <Link className="raillink" href="/utility-guide">Utility Guide →</Link>
          <Link className="raillink" href="/">Compliance home →</Link>
        </div>
      </aside>

      {/* ── Canvas ── */}
      <main className="canvas">
        <div className="pagehead">
          <h1>Action Items</h1>
          <div className="ctx">
            {board && (
              <>
                <span className={`due ${board.live ? "week" : "later"}`}>
                  {board.live ? "live · HubSpot" : demo ? "sample data" : "not configured"}
                </span>
                <span>{pipelines.length} pipelines</span>
                <span>·</span>
                <span>grouped by {dimLabel}</span>
              </>
            )}
          </div>
        </div>

        {board?.note && <div className={`banner ${demo ? "demo" : ""}`}>{board.note}</div>}
        {errorMessage && <div className="banner">Could not load: {errorMessage}</div>}

        {board && (
          <>
            {/* Dynamic KPIs — reflect the selected pipelines + the group-by */}
            <div className="grid kpi-row">
              <Kpi label="Open action items" value={board.totals.total} sub={`${pipelines.length} pipelines`} />
              <Kpi label="Overdue" value={board.totals.overdue} tone={board.totals.overdue > 0 ? "bad" : undefined} />
              <Kpi
                label="Due ≤ 7 days"
                value={board.totals.dueToday + board.totals.dueThisWeek}
                sub={`${board.totals.dueToday} today`}
                tone={board.totals.dueToday + board.totals.dueThisWeek > 0 ? "warn" : undefined}
              />
              <Kpi label={`${dimLabel} groups`} value={board.groups.length} />
              <Kpi
                label={`Busiest ${dimLabel.toLowerCase()}`}
                value={board.topGroup ? board.topGroup.label : "—"}
                sub={board.topGroup ? `${board.topGroup.count} items` : undefined}
                small
              />
            </div>

            {/* Group-by chips (below the KPI card) — includes Ticket Owner */}
            <div className="toolbar">
              <span className="lbl">Group by</span>
              <div className="chips">
                {GROUP_DIMENSIONS.map((g) => (
                  <Link key={g.key} className={`chip ${groupBy === g.key ? "on" : ""}`} href={hrefWith({ groupBy: g.key }, base)}>
                    {g.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* CTA table */}
            <div className="tbl-wrap" style={{ marginTop: 10 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Action / subject</th>
                    <th>Pipeline · stage</th>
                    <th>Due</th>
                    <th>Address</th>
                    <th>State / region</th>
                    <th>Portfolio / org</th>
                    <th>Owner</th>
                    <th>Priority</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {board.groups.length === 0 && (
                    <tr>
                      <td colSpan={9} className="empty">
                        No open action items for the selected pipelines.
                        {!demo && !board.live && (
                          <>
                            {" "}
                            <Link href={hrefWith({ demo: true }, base)}>Preview with sample data →</Link>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                  {board.groups.map((grp) => (
                    <GroupBlock key={grp.key} label={grp.label} count={grp.count} overdue={grp.overdue} items={grp.items} />
                  ))}
                </tbody>
              </table>
            </div>

            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              {board.live ? "Live from HubSpot" : "Not live"} · generated{" "}
              {new Date(board.generatedAt).toLocaleString("en-US")} · due date =
              {" "}<code>follow_up_date</code> · address = <code>full_address</code> ·
              owner resolved from <code>hubspot_owner_id</code>. Fields overridable via env.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

// ── Small components ─────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  tone,
  small,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "bad" | "warn" | "good";
  small?: boolean;
}) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ""}`} style={small ? { fontSize: 15, lineHeight: 1.25 } : undefined}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function GroupBlock({
  label,
  count,
  overdue,
  items,
}: {
  label: string;
  count: number;
  overdue: number;
  items: CtaItem[];
}) {
  return (
    <>
      <tr className="grouphead">
        <td colSpan={9}>
          {label} <span className="gcount">· {count}</span>
          {overdue > 0 && <span className="gover"> · {overdue} overdue</span>}
        </td>
      </tr>
      {items.map((it) => (
        <tr key={it.id}>
          <td className="wrap">{it.subject}</td>
          <td className="wrap">
            <strong>{it.pipelineLabel}</strong>
            <br />
            <span className="muted">{it.stageLabel}</span>
          </td>
          <td>
            <DueBadge item={it} />
          </td>
          <td className="wrap">{it.address ?? "—"}</td>
          <td>
            {it.state ?? "—"}
            {it.region ? <span className="muted"> · {it.region}</span> : ""}
          </td>
          <td>
            {it.portfolio ?? "—"}
            {it.organization ? <span className="muted"> · {it.organization}</span> : ""}
          </td>
          <td>{it.ownerName ?? (it.ownerId ? <span className="muted">#{it.ownerId}</span> : "—")}</td>
          <td>{it.priority ? <span className={`prio ${it.priority.toLowerCase()}`}>{it.priority}</span> : "—"}</td>
          <td>
            {it.url && it.url !== "#" ? (
              <a href={it.url} target="_blank" rel="noreferrer">open ↗</a>
            ) : (
              <span className="muted">—</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function DueBadge({ item }: { item: CtaItem }) {
  const label =
    item.dueBucket === "overdue"
      ? "Overdue"
      : item.dueBucket === "today"
        ? "Today"
        : item.dueBucket === "week"
          ? "This week"
          : item.dueBucket === "later"
            ? "Later"
            : "No due date";
  return (
    <span className={`due ${item.dueBucket}`}>
      {label}
      {item.dueDate ? ` · ${fmtDate(item.dueDate)}` : ""}
    </span>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
