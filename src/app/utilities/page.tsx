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

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALL_IDS = PIPELINES.map((p) => p.id);
const GROUP_KEYS = new Set(GROUP_DIMENSIONS.map((g) => g.key));

// ── URL helpers ──────────────────────────────────────────────────────────────

type State = { pipelines: string[]; groupBy: GroupDimension; demo: boolean };

function hrefWith(s: Partial<State>, base: State): string {
  const pipelines = s.pipelines ?? base.pipelines;
  const groupBy = s.groupBy ?? base.groupBy;
  const demo = s.demo ?? base.demo;
  const params = new URLSearchParams();
  // Only encode pipelines when they differ from the monitored default.
  const def = monitoredPipelineIds();
  const same =
    pipelines.length === def.length && pipelines.every((id) => def.includes(id));
  if (!same) params.set("pipelines", pipelines.join(","));
  if (groupBy !== "pipeline") params.set("groupBy", groupBy);
  if (demo) params.set("demo", "1");
  const qs = params.toString();
  return `/utilities${qs ? `?${qs}` : ""}`;
}

function togglePipeline(id: string, base: State): string {
  const set = new Set(base.pipelines);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return hrefWith({ pipelines: ALL_IDS.filter((x) => set.has(x)) }, base);
}

// ── Page ─────────────────────────────────────────────────────────────────────

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

  let board: CtaResult | null = null;
  let errorMessage: string | null = null;
  try {
    board = await getCtaBoard({ pipelineIds: pipelines, groupBy, demo });
  } catch (err) {
    errorMessage = (err as Error).message;
  }

  return (
    <div className="app">
      <Rail base={base} />
      <main className="canvas">
        <p className="crumb">
          <Link href="/">← Compliance</Link>
          {" · "}
          <Link href="/utility-guide">Utility Guide</Link>
        </p>
        <div className="pagehead">
          <h1>Action Items</h1>
          <div className="ctx">
            {board && (
              <>
                <span className={`due ${board.live ? "week" : "later"}`}>
                  {board.live ? "live · HubSpot" : demo ? "sample data" : "not configured"}
                </span>
                <span>{pipelines.length} pipelines monitored</span>
                <span>·</span>
                <span>grouped by {labelFor(groupBy)}</span>
              </>
            )}
          </div>
        </div>

        {board?.note && (
          <div className={`banner ${demo ? "demo" : ""}`}>{board.note}</div>
        )}
        {errorMessage && <div className="banner">Could not load: {errorMessage}</div>}

        {board && (
          <>
            <div className="grid kpi-row">
              <Kpi label="Open action items" value={board.totals.total} />
              <Kpi label="Overdue" value={board.totals.overdue} tone={board.totals.overdue > 0 ? "bad" : undefined} />
              <Kpi label="Due today" value={board.totals.dueToday} tone={board.totals.dueToday > 0 ? "warn" : undefined} />
              <Kpi label="Due this week" value={board.totals.dueThisWeek} />
              <Kpi label="Pipelines / stages" value={`${pipelines.length} / ${PIPELINE_COUNT}`} sub={`${STAGE_COUNT} stages total`} />
            </div>

            {/* Group-by selector */}
            <div className="toolbar">
              <span className="lbl">Group by</span>
              <div className="chips">
                {GROUP_DIMENSIONS.map((g) => (
                  <Link
                    key={g.key}
                    className={`chip ${groupBy === g.key ? "on" : ""}`}
                    href={hrefWith({ groupBy: g.key }, base)}
                  >
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
                    <th>Priority</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {board.groups.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty">
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
                    <GroupBlock key={grp.key} label={grp.label} count={grp.count} overdue={grp.overdue} items={grp.items} groupBy={groupBy} />
                  ))}
                </tbody>
              </table>
            </div>

            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Skeleton for review · {board.live ? "live from HubSpot" : "not live"} ·
              generated {new Date(board.generatedAt).toLocaleString("en-US")}.
              Address / state / region / portfolio / organization populate from the
              ticket property names configured in env (see docs).
            </p>
          </>
        )}
      </main>
    </div>
  );
}

// ── Rail (the menu) ──────────────────────────────────────────────────────────

function Rail({ base }: { base: State }) {
  const selected = new Set(base.pipelines);
  return (
    <aside className="rail">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/resihome-logo.png" alt="ResiHome" />
      <div className="accent" />
      <div className="tagline">OPERATIONS · ACTION ITEMS</div>

      <div className="slicer">
        <h4>Group pipelines by</h4>
        <div className="chips">
          {GROUP_DIMENSIONS.map((g) => (
            <Link key={g.key} className={`chip ${base.groupBy === g.key ? "on" : ""}`} href={hrefWith({ groupBy: g.key }, base)}>
              {g.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="slicer">
        <h4>
          Monitored pipelines <span className="muted">({selected.size})</span>
        </h4>
        <div className="chips" style={{ marginBottom: 8 }}>
          <Link className="chip" href={hrefWith({ pipelines: ALL_IDS }, base)}>All</Link>
          <Link className="chip" href={hrefWith({ pipelines: [] }, base)}>None</Link>
          <Link className="chip" href="/utilities">Default</Link>
        </div>
        {pipelinesByCategory().map((cat) => (
          <div className="cat" key={cat.category}>
            <h5>{cat.category}</h5>
            <div className="chips">
              {cat.pipelines.map((p) => (
                <Link
                  key={p.id}
                  className={`chip ${selected.has(p.id) ? "on" : ""}`}
                  href={togglePipeline(p.id, base)}
                  title={`${p.stages.length} stages · id ${p.id}`}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="slicer">
        <h4>Filters</h4>
        <p className="railnote">
          Portfolio / organization / region / state / address are grouped from the
          associated property fields on each ticket. Wire the HubSpot property
          names via env to filter and group live.
        </p>
        {!base.demo && (
          <Link className="raillink" href={hrefWith({ demo: true }, base)}>Preview with sample data →</Link>
        )}
        {base.demo && (
          <Link className="raillink" href={hrefWith({ demo: false }, base)}>Exit sample preview →</Link>
        )}
      </div>
    </aside>
  );
}

// ── Small components ─────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "bad" | "warn" | "good";
}) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ""}`}>
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
  groupBy,
}: {
  label: string;
  count: number;
  overdue: number;
  items: CtaItem[];
  groupBy: GroupDimension;
}) {
  return (
    <>
      <tr className="grouphead">
        <td colSpan={8}>
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

function labelFor(g: GroupDimension): string {
  return GROUP_DIMENSIONS.find((x) => x.key === g)?.label ?? g;
}
