import Link from "next/link";
import {
  COMMUNITIES,
  BUILDER_COMMUNITIES,
  OWNER_RULES,
  LEAK_ADJUSTMENTS,
  PROVIDER_INTEL,
  LOA_REQUIREMENTS,
  MISC_FEES,
  CADENCE,
  RESOURCES,
  CONSERVICE_CONTACTS,
  POLICIES,
  GUIDE_SOURCE_URL,
  GUIDE_SNAPSHOT_DATE,
  stateSummaries,
  communitiesByState,
  providerUsage,
  findCommunity,
  communityReference,
  regionForState,
  fieldMapFor,
  UTILITIES_PIPELINE_ID,
  COMPLIANCE_ISSUES_PIPELINE_ID,
  type Community,
  type CommunityReference,
} from "@/lib/utilityGuide";
import {
  getCachedPipelineBoard,
  HUBSPOT_PORTAL_ID,
  HubSpotNotConfiguredError,
  type PipelineBoard,
} from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── small helpers ───────────────────────────────────────────────────────────

function val(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const LENSES: Array<{ key: string; label: string }> = [
  { key: "owner", label: "Owner / fund rules" },
  { key: "provider", label: "Providers" },
  { key: "leak", label: "Leak adjustments" },
  { key: "intel", label: "Provider intel" },
  { key: "loa", label: "LOA required" },
  { key: "ops", label: "Ops & policies" },
  { key: "fieldmap", label: "HubSpot field map" },
];

// ── page ────────────────────────────────────────────────────────────────────

export default async function UtilityGuidePage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    community?: string;
    lens?: string;
  }>;
}) {
  const { state, community, lens } = await searchParams;

  return (
    <main className="container wide">
      <div className="header">
        <div>
          <p className="crumb">
            <Link href="/">← Compliance</Link>
            {(state || community || lens) && (
              <>
                {" · "}
                <Link href="/utility-guide">Utility Guide</Link>
              </>
            )}
          </p>
          <h1 className="title">Utility Guide</h1>
        </div>
        <a className="badge" href={GUIDE_SOURCE_URL} target="_blank" rel="noreferrer">
          Google Sheet ↗
        </a>
      </div>

      <p className="subtitle">
        The ResiHome utility bible — providers, who-pays rules, leak-adjustment
        policies and provider intel by state, community and owner — captured so a
        HubSpot property or ticket can be referenced live.{" "}
        <span className="muted">
          Snapshot {GUIDE_SNAPSHOT_DATE} · reference data.
        </span>
      </p>

      {/* Lens nav */}
      <div className="lensnav">
        <Link
          className={`lens ${!lens && !state && !community ? "active" : ""}`}
          href="/utility-guide"
        >
          Overview
        </Link>
        {LENSES.map((l) => (
          <Link
            key={l.key}
            className={`lens ${lens === l.key ? "active" : ""}`}
            href={`/utility-guide?lens=${l.key}`}
          >
            {l.label}
          </Link>
        ))}
      </div>

      {community ? (
        <CommunityDetail community={community} state={state} />
      ) : state ? (
        <StateView state={state} />
      ) : lens === "owner" ? (
        <OwnerRulesView />
      ) : lens === "provider" ? (
        <ProviderIndexView />
      ) : lens === "leak" ? (
        <LeakAdjustmentsView />
      ) : lens === "intel" ? (
        <ProviderIntelView />
      ) : lens === "loa" ? (
        <LoaView />
      ) : lens === "ops" ? (
        <OpsView />
      ) : lens === "fieldmap" ? (
        <FieldMapView />
      ) : (
        <Overview />
      )}
    </main>
  );
}

// ── Overview (recommendation + drill-down + live HubSpot) ────────────────────

async function Overview() {
  const states = stateSummaries();
  const groups = communitiesByState();
  const totalCommunities = COMMUNITIES.length;
  const providers = providerUsage();

  return (
    <>
      <RecommendationBanner />

      <LivePipelines />

      <h2 className="section-title">
        Drill down · State → Community ({states.length} states, {totalCommunities}{" "}
        communities)
      </h2>
      <section className="panel">
        <div className="table-scroll">
          <table className="ptable">
            <thead>
              <tr>
                <th>State</th>
                <th>Region</th>
                <th className="num">Communities</th>
                <th className="num">Distinct providers</th>
                <th>Communities</th>
              </tr>
            </thead>
            <tbody>
              {states.map((s) => {
                const group = groups.find((g) => g.state === s.state);
                return (
                  <tr key={s.state}>
                    <td>
                      <Link href={`/utility-guide?state=${encodeURIComponent(s.state)}`}>
                        <strong>{s.state}</strong>
                      </Link>
                    </td>
                    <td className="muted">{s.region}</td>
                    <td className="num">{s.communityCount}</td>
                    <td className="num">{s.providerCount}</td>
                    <td className="muted">
                      {group?.communities.map((c, i) => (
                        <span key={c.name}>
                          {i > 0 && ", "}
                          <Link
                            href={`/utility-guide?community=${encodeURIComponent(
                              c.name,
                            )}&state=${encodeURIComponent(c.state)}`}
                          >
                            {c.name}
                          </Link>
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="section-title">Coverage at a glance</h2>
      <div className="grid">
        <div className="card">
          <h2>{COMMUNITIES.length} communities</h2>
          <p>Across {states.length} states, keyed to their five utility providers.</p>
        </div>
        <div className="card">
          <h2>{providers.length} providers</h2>
          <p>
            {providers.filter((p) => p.hasLeakPolicy).length} with a leak-adjustment
            policy · {providers.filter((p) => p.hasCredential).length} with a portal
            login on file.
          </p>
        </div>
        <div className="card">
          <h2>{OWNER_RULES.length} owner / fund rules</h2>
          <p>
            Vacant-vs-occupied responsibility keyed by Entity-ID prefix (RP, RB, AH,
            HO, ROI, RH, NS…).
          </p>
        </div>
        <div className="card">
          <h2>{BUILDER_COMMUNITIES.length} builder communities</h2>
          <p>DreamFinders, McKinley Homes and Rocklyn Homes rosters.</p>
        </div>
      </div>
    </>
  );
}

function RecommendationBanner() {
  return (
    <section className="panel reco">
      <h2 className="section-title" style={{ marginTop: 4 }}>
        Recommendation · drill-down cadence
      </h2>
      <div className="detail-grid">
        <div className="span-all">
          <p>
            <strong>Primary: State → Community.</strong> The <em>community</em> is the
            atomic operational unit — every home in a community shares the same five
            utility providers and the same billing setup — and communities roll up
            cleanly to <em>state</em>, which is where provider, leak-adjustment and
            regulatory differences actually live. That is the fast path for
            &ldquo;what do I need to know for this property.&rdquo;
          </p>
          <p>
            <strong>Owner / fund and Provider are cross-cutting lenses, not the top
            level.</strong> <em>Owner</em> (by Entity-ID prefix) governs
            who-pays-what (vacant vs. occupied); <em>Provider</em> governs process
            (leak adjustments, LOA, logins). Use them to filter, not to browse.
          </p>
          <p>
            <strong>Address is the join key, not a browse tier.</strong> It is where
            the guide meets HubSpot — the live bump — but the reference data is
            keyed at community grain, so a property inherits its guide entry through
            its community / state / owner. <strong>Region</strong> (Southeast, South
            Central…) is a soft rollup above state, offered for reporting only.
          </p>
        </div>
      </div>
    </section>
  );
}

async function LivePipelines() {
  const pipelines: Array<{ label: string; id: string | null }> = [
    { label: "Utilities", id: UTILITIES_PIPELINE_ID },
    { label: "Compliance Issues", id: COMPLIANCE_ISSUES_PIPELINE_ID },
  ];

  const boards = await Promise.all(
    pipelines.map(async (p) => {
      if (!p.id) return { ...p, board: null as PipelineBoard | null, error: "Pipeline id not set" };
      try {
        const board = await getCachedPipelineBoard(p.id, 0);
        return { ...p, board, error: null as string | null };
      } catch (err) {
        const error =
          err instanceof HubSpotNotConfiguredError
            ? "HubSpot not configured"
            : (err as Error).message;
        return { ...p, board: null as PipelineBoard | null, error };
      }
    }),
  );

  return (
    <>
      <h2 className="section-title">Live bump · HubSpot ticket pipelines</h2>
      <div className="grid">
        {boards.map((b) => (
          <div className="card" key={b.label}>
            <h2>
              <span className={`status ${b.board ? "ok" : "off"}`} />
              {b.board ? b.board.label : b.label} pipeline
            </h2>
            {b.board ? (
              <>
                <p>
                  <strong>{b.board.totalCount.toLocaleString()}</strong> tickets across{" "}
                  {b.board.stages.length} stages · live from HubSpot.
                </p>
                {b.label === "Utilities" && (
                  <p>
                    <Link href="/pipelines/utilities-activation">Open the board →</Link>
                  </p>
                )}
              </>
            ) : (
              <p className="muted">
                {b.error}.{" "}
                {b.label === "Compliance Issues" && (
                  <>Set <code>HUBSPOT_COMPLIANCE_ISSUES_PIPELINE_ID</code> to light this up.</>
                )}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── State view (communities in a state) ──────────────────────────────────────

function StateView({ state }: { state: string }) {
  const key = state.trim().toUpperCase();
  const group = communitiesByState().find((g) => g.state === key);

  if (!group) {
    return <p className="empty">No communities found for state {key}.</p>;
  }

  return (
    <>
      <h2 className="section-title">
        {key} · {regionForState(key)} · {group.communities.length} communities
      </h2>
      <section className="panel">
        <div className="table-scroll">
          <table className="ptable">
            <thead>
              <tr>
                <th>Community</th>
                <th>Owner</th>
                <th>Electric</th>
                <th>Water</th>
                <th>Sewer</th>
                <th>Gas</th>
                <th>Trash</th>
              </tr>
            </thead>
            <tbody>
              {group.communities.map((c) => (
                <tr key={c.name}>
                  <td>
                    <Link
                      href={`/utility-guide?community=${encodeURIComponent(
                        c.name,
                      )}&state=${encodeURIComponent(c.state)}`}
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="muted">{val(c.owner)}</td>
                  <td>{val(c.providers.electric)}</td>
                  <td>{val(c.providers.water)}</td>
                  <td>{val(c.providers.sewer)}</td>
                  <td>{val(c.providers.gas)}</td>
                  <td>{val(c.providers.trash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ── Community detail (the full reference bundle) ─────────────────────────────

function CommunityDetail({
  community,
  state,
}: {
  community: string;
  state?: string;
}) {
  const found: Community | null = findCommunity(community, state);
  if (!found) {
    return (
      <p className="empty">
        No community matching “{community}”{state ? ` in ${state}` : ""}.
      </p>
    );
  }
  const ref: CommunityReference = communityReference(found);
  const c = ref.community;

  const utilRows: Array<[string, string | null, string | null]> = [
    ["Electric", c.providers.electric, c.billing.electric],
    ["Gas", c.providers.gas, c.billing.gas],
    ["Water", c.providers.water, c.billing.water],
    ["Sewer", c.providers.sewer, null],
    ["Trash", c.providers.trash, c.billing.trash],
  ];

  return (
    <>
      <div className="header" style={{ marginTop: 8 }}>
        <div>
          <p className="crumb">
            <Link href={`/utility-guide?state=${encodeURIComponent(c.state)}`}>
              ← {c.state}
            </Link>
          </p>
          <h2 className="title" style={{ fontSize: 22 }}>
            {c.name}
          </h2>
        </div>
        <span className="badge">
          {c.state} · {ref.region}
          {c.owner ? ` · ${c.owner}` : ""}
        </span>
      </div>

      {/* Providers + who-pays */}
      <h2 className="section-title">Providers &amp; who pays</h2>
      <section className="panel">
        <div className="table-scroll">
          <table className="ptable">
            <thead>
              <tr>
                <th>Utility</th>
                <th>Provider</th>
                <th>Who pays</th>
              </tr>
            </thead>
            <tbody>
              {utilRows.map(([u, provider, payer]) => (
                <tr key={u}>
                  <td>
                    <strong>{u}</strong>
                  </td>
                  <td>{val(provider)}</td>
                  <td className="muted">{u === "Sewer" ? "(follows water)" : val(payer)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(c.cost || c.notes) && (
          <div className="detail-grid">
            {c.cost && <Cell label="Cost" value={val(c.cost)} />}
            {c.notes && <Cell label="Notes" value={val(c.notes)} span />}
          </div>
        )}
      </section>

      {/* Owner / fund rule */}
      {ref.ownerRule && (
        <>
          <h2 className="section-title">Owner / fund rule · {ref.ownerRule.client}</h2>
          <section className="panel detail-grid">
            <Cell label="Entity prefixes" value={val(ref.ownerRule.entityPrefixes.join(", "))} />
            <Cell label="Vacant utilities" value={val(ref.ownerRule.vacantUtilities)} />
            <Cell label="Occupied utilities" value={val(ref.ownerRule.occupiedUtilities)} />
            {ref.ownerRule.notes && <Cell label="Notes" value={val(ref.ownerRule.notes)} span />}
            {ref.ownerRule.rules.length > 0 && (
              <div className="span-all">
                <span className="field-label">Rules</span>
                <ul className="rulelist">
                  {ref.ownerRule.rules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      {/* Provider portal logins */}
      <h2 className="section-title">Provider logins</h2>
      {ref.credentials.length === 0 ? (
        <p className="empty">No portal logins on file for this community&apos;s providers.</p>
      ) : (
        <section className="panel">
          <div className="table-scroll">
            <table className="ptable">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Website</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {ref.credentials.map((cred) => (
                  <tr key={cred.provider}>
                    <td>{cred.provider}</td>
                    <td>
                      {cred.website ? (
                        <a href={cred.website} target="_blank" rel="noreferrer">
                          link ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="muted">{val(cred.username)}</td>
                    <td>
                      <span className="pill">{cred.hasPassword ? "in Sheet" : "n/a"}</span>
                    </td>
                    <td className="muted">{val(cred.notes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ padding: "8px 12px", margin: 0, fontSize: 12.5 }}>
            Passwords are intentionally not stored in this app — they stay in the
            source Sheet / a vault.
          </p>
        </section>
      )}

      {/* Leak adjustments for this state's matching providers */}
      <h2 className="section-title">Leak adjustments</h2>
      <LeakTable rows={ref.leakAdjustments} empty="No matching leak-adjustment policy on file." />

      {/* LOA requirements */}
      {ref.loaRequirements.length > 0 && (
        <>
          <h2 className="section-title">Letter of Authorization required</h2>
          <LoaTable rows={ref.loaRequirements} />
        </>
      )}

      {/* Provider intel */}
      <h2 className="section-title">Provider intel</h2>
      <IntelTable rows={ref.intel} empty="No provider intel logged for this state's providers." />
    </>
  );
}

// ── Lens views ───────────────────────────────────────────────────────────────

function OwnerRulesView() {
  return (
    <>
      <h2 className="section-title">
        Owner / fund utility responsibility ({OWNER_RULES.length})
      </h2>
      <p className="subtitle">
        The authoritative &ldquo;who handles what,&rdquo; keyed by the Entity-ID
        prefix on the HubSpot property.
      </p>
      {OWNER_RULES.map((r) => (
        <section className="panel detail-grid" key={r.client} style={{ marginBottom: 14 }}>
          <div className="span-all">
            <span className="field-label">Client / fund</span>
            <strong>
              {r.client}
              {r.entityPrefixes.length > 0 && (
                <span className="pill" style={{ marginLeft: 8 }}>
                  {r.entityPrefixes.join(", ")}
                </span>
              )}
            </strong>
          </div>
          <Cell label="Vacant utilities" value={val(r.vacantUtilities)} />
          <Cell label="Occupied utilities" value={val(r.occupiedUtilities)} />
          {r.notes && <Cell label="Notes" value={val(r.notes)} span />}
          {r.rules.length > 0 && (
            <div className="span-all">
              <span className="field-label">Rules</span>
              <ul className="rulelist">
                {r.rules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </>
  );
}

function ProviderIndexView() {
  const providers = providerUsage();
  const maxCommunities = Math.max(1, ...providers.map((p) => p.communities.length));
  return (
    <>
      <h2 className="section-title">Provider index ({providers.length})</h2>
      <section className="panel">
        <div className="table-scroll">
          <table className="ptable">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Utilities</th>
                <th>States</th>
                <th className="share">Communities</th>
                <th>Login</th>
                <th>Leak policy</th>
                <th>LOA</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.provider}>
                  <td>{p.provider}</td>
                  <td className="muted">{p.utilities.join(", ")}</td>
                  <td className="muted">{p.states.join(", ")}</td>
                  <td className="share">
                    <span className="bar-wrap">
                      <span
                        className="bar"
                        style={{
                          width: `${Math.max(
                            (p.communities.length / maxCommunities) * 100,
                            4,
                          )}%`,
                        }}
                      />
                    </span>
                    <span className="pct">{p.communities.length}</span>
                  </td>
                  <td>{p.hasCredential ? <span className="pill">yes</span> : "—"}</td>
                  <td>{p.hasLeakPolicy ? <span className="pill">yes</span> : "—"}</td>
                  <td>{p.hasLoa ? <span className="pill">yes</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function LeakAdjustmentsView() {
  return (
    <>
      <h2 className="section-title">Leak-adjustment policies ({LEAK_ADJUSTMENTS.length})</h2>
      <LeakTable rows={LEAK_ADJUSTMENTS} empty="None." />
    </>
  );
}

function ProviderIntelView() {
  return (
    <>
      <h2 className="section-title">Provider intel ({PROVIDER_INTEL.length})</h2>
      <IntelTable rows={PROVIDER_INTEL} empty="None." />
    </>
  );
}

function LoaView() {
  return (
    <>
      <h2 className="section-title">
        Providers requiring a Letter of Authorization ({LOA_REQUIREMENTS.length})
      </h2>
      <LoaTable rows={LOA_REQUIREMENTS} />
    </>
  );
}

function OpsView() {
  const util = CADENCE.filter((c) => c.team === "Utilities");
  const pm = CADENCE.filter((c) => c.team === "PM");
  return (
    <>
      <h2 className="section-title">Weekly cadence</h2>
      <CadenceTable title="Utilities team" rows={util} />
      <CadenceTable title="PM" rows={pm} />

      <h2 className="section-title">Standing policies</h2>
      <section className="panel detail-grid">
        {POLICIES.map((p) => (
          <Cell key={p.topic} label={p.topic} value={p.detail} span />
        ))}
      </section>

      <h2 className="section-title">Recurring fees</h2>
      <section className="panel">
        <div className="table-scroll">
          <table className="ptable">
            <thead>
              <tr>
                <th>Service</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {MISC_FEES.map((f) => (
                <tr key={f.service}>
                  <td>{f.service}</td>
                  <td>{f.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <h2 className="section-title">Conservice contacts</h2>
      <section className="panel detail-grid">
        {CONSERVICE_CONTACTS.map((c) => (
          <Cell key={c.purpose} label={c.purpose} value={c.value} />
        ))}
      </section>

      <h2 className="section-title">Resources</h2>
      <section className="panel">
        <div className="table-scroll">
          <table className="ptable">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Link</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        open ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="muted">{val(r.note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function FieldMapView() {
  const propertyFields = fieldMapFor("property");
  const ticketFields = fieldMapFor("ticket");
  const boardUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/objects/0-5/views/all/board`;

  return (
    <>
      <h2 className="section-title">HubSpot field mapping</h2>
      <p className="subtitle">
        How the guide&apos;s reference fields line up with HubSpot&apos;s live
        Property object and the Utilities / Compliance-Issues ticket pipelines.{" "}
        <span className="muted">
          <span className="pill">join</span> marks the keys used to bind a live
          record to a guide entry.
        </span>
      </p>

      <h2 className="section-title">Property object</h2>
      <FieldMapTable rows={propertyFields} />

      <h2 className="section-title">
        Ticket object ·{" "}
        <a href={boardUrl} target="_blank" rel="noreferrer">
          pipelines ↗
        </a>
      </h2>
      <FieldMapTable rows={ticketFields} showPipeline />
    </>
  );
}

// ── shared render helpers ────────────────────────────────────────────────────

function Cell({
  label,
  value,
  span,
}: {
  label: string;
  value: string;
  span?: boolean;
}) {
  return (
    <div className={span ? "span-all" : undefined}>
      <span className="field-label">{label}</span>
      <span className="preline">{value}</span>
    </div>
  );
}

function LeakTable({
  rows,
  empty,
}: {
  rows: typeof LEAK_ADJUSTMENTS;
  empty: string;
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <section className="panel">
      <div className="table-scroll">
        <table className="ptable">
          <thead>
            <tr>
              <th>State</th>
              <th>Provider</th>
              <th>Utility</th>
              <th>Frequency</th>
              <th style={{ minWidth: 320, whiteSpace: "normal" }}>Process / notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((la, i) => (
              <tr key={`${la.provider}-${i}`}>
                <td>{la.state}</td>
                <td>{la.provider}</td>
                <td className="muted">{la.utilityType}</td>
                <td>{val(la.frequency)}</td>
                <td style={{ whiteSpace: "normal" }}>
                  {val(la.process || la.notes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IntelTable({
  rows,
  empty,
}: {
  rows: typeof PROVIDER_INTEL;
  empty: string;
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <section className="panel">
      <div className="table-scroll">
        <table className="ptable">
          <thead>
            <tr>
              <th>State</th>
              <th>City</th>
              <th>Provider</th>
              <th>Utility</th>
              <th>Date</th>
              <th style={{ minWidth: 320, whiteSpace: "normal" }}>What we should know</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((pi, i) => (
              <tr key={`${pi.provider}-${i}`}>
                <td>{val(pi.state)}</td>
                <td className="muted">{val(pi.city)}</td>
                <td>{pi.provider}</td>
                <td className="muted">{val(pi.utility)}</td>
                <td className="muted">{val(pi.dateReceived)}</td>
                <td style={{ whiteSpace: "normal" }}>{pi.whatToKnow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LoaTable({ rows }: { rows: typeof LOA_REQUIREMENTS }) {
  return (
    <section className="panel">
      <div className="table-scroll">
        <table className="ptable">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Required</th>
              <th>Response received</th>
              <th>Required answer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.provider}>
                <td>{l.provider}</td>
                <td>{l.required}</td>
                <td className="muted">{val(l.responseReceived)}</td>
                <td className="muted">{val(l.requiredAnswer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CadenceTable({
  title,
  rows,
}: {
  title: string;
  rows: typeof CADENCE;
}) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="table-scroll">
        <table className="ptable">
          <thead>
            <tr>
              <th>{title}</th>
              {days.map((d) => (
                <th key={d} className="num">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.task}>
                <td style={{ whiteSpace: "normal" }}>{r.task}</td>
                {days.map((d) => (
                  <td key={d} className="num">
                    {r.days.includes(d) ? "•" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FieldMapTable({
  rows,
  showPipeline,
}: {
  rows: ReturnType<typeof fieldMapFor>;
  showPipeline?: boolean;
}) {
  return (
    <section className="panel">
      <div className="table-scroll">
        <table className="ptable">
          <thead>
            <tr>
              {showPipeline && <th>Pipeline</th>}
              <th>HubSpot property</th>
              <th>Label</th>
              <th>Guide source</th>
              <th>Join</th>
              <th style={{ minWidth: 260, whiteSpace: "normal" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr key={`${f.hubspotProperty}-${i}`}>
                {showPipeline && (
                  <td className="muted">{f.pipeline ?? "—"}</td>
                )}
                <td>
                  <code>{f.hubspotProperty}</code>
                </td>
                <td>{f.label}</td>
                <td className="muted">{f.guideSource}</td>
                <td>{f.join ? <span className="pill">join</span> : "—"}</td>
                <td style={{ whiteSpace: "normal" }}>{f.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
