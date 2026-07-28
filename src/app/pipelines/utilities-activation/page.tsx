import Link from "next/link";
import {
  getCachedPipelineBoard,
  DEFAULT_PIPELINE_ID,
  HUBSPOT_PORTAL_ID,
  HubSpotNotConfiguredError,
  type PipelineBoard,
} from "@/lib/pipeline";

// Render per-request (never baked at build time), while the HubSpot data
// itself is cached for 60s via unstable_cache in the pipeline lib — so the
// page is fresh, rate-limit safe, and not coupled to the build environment.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function priorityClass(p: string | null): string {
  switch ((p || "").toUpperCase()) {
    case "HIGH":
      return "prio prio-high";
    case "MEDIUM":
      return "prio prio-med";
    case "LOW":
      return "prio prio-low";
    default:
      return "prio";
  }
}

export default async function UtilitiesActivationBoard() {
  let board: PipelineBoard | null = null;
  let errorMessage: string | null = null;

  try {
    board = await getCachedPipelineBoard(DEFAULT_PIPELINE_ID, 8);
  } catch (err) {
    errorMessage =
      err instanceof HubSpotNotConfiguredError
        ? "HubSpot is not configured (HUBSPOT_TOKEN missing in this environment)."
        : (err as Error).message;
  }

  const boardUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/objects/0-5/views/all/board`;

  return (
    <main className="container wide">
      <div className="header">
        <div>
          <p className="crumb">
            <Link href="/">← Compliance</Link>
          </p>
          <h1 className="title">
            {board ? board.label : "Utilities Activation"} pipeline
          </h1>
        </div>
        <a className="badge" href={boardUrl} target="_blank" rel="noreferrer">
          Open in HubSpot ↗
        </a>
      </div>

      {board && (
        <p className="subtitle">
          {board.totalCount.toLocaleString()} tickets across{" "}
          {board.stages.length} stages · live from HubSpot ·{" "}
          {new Date(board.generatedAt).toLocaleString("en-US")}
        </p>
      )}

      {errorMessage && (
        <div className="card error">
          <h2>Could not load pipeline</h2>
          <p>{errorMessage}</p>
        </div>
      )}

      {board && (
        <>
          {/* ---- Summary table: stage → state → count → share ---- */}
          <section className="panel">
            <h2 className="section-title">Stage summary</h2>
            <div className="table-scroll">
              <table className="ptable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Stage</th>
                    <th>State</th>
                    <th className="num">Tickets</th>
                    <th className="share">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {board.stages.map((s, i) => {
                    const pct =
                      board!.totalCount > 0
                        ? (s.count / board!.totalCount) * 100
                        : 0;
                    return (
                      <tr key={s.id}>
                        <td className="muted">{i + 1}</td>
                        <td>{s.label}</td>
                        <td>
                          <span
                            className={`state ${
                              s.state === "CLOSED" ? "closed" : "open"
                            }`}
                          >
                            {s.state}
                          </span>
                        </td>
                        <td className="num">{s.count.toLocaleString()}</td>
                        <td className="share">
                          <span className="bar-wrap" title={`${pct.toFixed(1)}%`}>
                            <span
                              className="bar"
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </span>
                          <span className="pct">{pct.toFixed(1)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td>Total</td>
                    <td />
                    <td className="num">
                      {board.totalCount.toLocaleString()}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ---- Board: one column per stage ---- */}
          <section>
            <h2 className="section-title">Board</h2>
            <div className="kanban">
              {board.stages.map((s) => (
                <div className="col" key={s.id}>
                  <div className="col-head">
                    <span
                      className={`dot ${
                        s.state === "CLOSED" ? "closed" : "open"
                      }`}
                    />
                    <span className="col-title">{s.label}</span>
                    <span className="col-count">
                      {s.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="col-body">
                    {s.tickets.length === 0 && (
                      <p className="empty">No tickets</p>
                    )}
                    {s.tickets.map((t) => (
                      <a
                        key={t.id}
                        className="ticket"
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="ticket-subj">{t.subject}</div>
                        <div className="ticket-meta">
                          {t.priority && (
                            <span className={priorityClass(t.priority)}>
                              {t.priority}
                            </span>
                          )}
                          <span className="muted">
                            upd {fmtDate(t.lastModified)}
                          </span>
                        </div>
                      </a>
                    ))}
                    {s.count > s.tickets.length && (
                      <div className="more">
                        + {(s.count - s.tickets.length).toLocaleString()} more in
                        HubSpot
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
