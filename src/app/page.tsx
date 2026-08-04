import Link from "next/link";
import { allIntegrationStatuses } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  const integrations = allIntegrationStatuses();

  return (
    <main className="container">
      <div className="header">
        <div>
          <h1 className="title">ResiHome Compliance</h1>
        </div>
        <span className="badge">
          <span className="status ok" /> Deployed on Vercel
        </span>
      </div>
      <p className="subtitle">
        Compliance data lookup across HubSpot and Snowflake. This dashboard and
        its API routes are deployed continuously from the <code>main</code>{" "}
        branch.
      </p>

      <div className="grid">
        <Link className="card" href="/utilities">
          <h2>
            <span className="status ok" /> Action Items (CTA board) →
          </h2>
          <p>
            Operations-styled action-items board across every HubSpot ticket
            pipeline — due dates, stages and address, with selectable monitored
            pipelines and grouping by portfolio, organization, region, state or
            address. Skeleton for review.
          </p>
        </Link>

        <Link className="card" href="/utility-guide">
          <h2>
            <span className="status ok" /> Utility Guide →
          </h2>
          <p>
            The RESIHOME utility bible — providers, who-pays rules,
            leak-adjustment policies and provider intel by state, community and
            owner — referenced live against the HubSpot Utilities and
            Compliance-Issues pipelines.
          </p>
        </Link>

        <Link className="card" href="/pipelines/utilities-activation">
          <h2>
            <span className="status ok" /> Utilities Activation pipeline →
          </h2>
          <p>
            Live board view mapping every stage of the HubSpot Utilities
            Activation ticket pipeline, with ticket counts and recent tickets
            per stage.
          </p>
        </Link>

        <Link className="card" href="/associations">
          <h2>
            <span className="status ok" /> Associations (HOA) →
          </h2>
          <p>
            HOA / association records from ResiAIMS — contacts, leasing,
            amenities, access codes, inspections, and the properties mapped to
            each association.
          </p>
        </Link>

        {integrations.map((it) => (
          <div className="card" key={it.name}>
            <h2>
              <span className={`status ${it.configured ? "ok" : "off"}`} />
              {it.name}
            </h2>
            <p>
              {it.configured
                ? "Credentials detected. Data lookup is available."
                : "Not configured yet. Add the required environment variables in Vercel."}
            </p>
            {!it.configured && it.missing.length > 0 && (
              <p>
                Missing:{" "}
                {it.missing.map((m) => (
                  <span className="pill" key={m} style={{ marginRight: 6 }}>
                    {m}
                  </span>
                ))}
              </p>
            )}
          </div>
        ))}

        <div className="card">
          <h2>API endpoints</h2>
          <p>Serverless routes available for data lookup:</p>
          <p>
            <code>GET /api/health</code>
            <br />
            <code>GET /api/hubspot?query=...</code>
            <br />
            <code>GET /api/snowflake?health=1</code>
            <br />
            <code>POST /api/snowflake</code>
            <br />
            <code>GET /api/associations</code>
          </p>
        </div>
      </div>

      <div className="footer">
        ResiHome Compliance · Environment configuration is managed in Vercel ·
        See <code>docs/</code> for deployment and integration guides.
      </div>
    </main>
  );
}
