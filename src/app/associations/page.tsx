import Link from "next/link";
import {
  listAssociations,
  getAssociation,
  SnowflakeNotConfiguredError,
  SnowflakeDriverUnavailableError,
  type AssociationSummary,
  type Association,
  type Address,
} from "@/lib/associations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function describeError(err: unknown): string {
  if (err instanceof SnowflakeNotConfiguredError) {
    return `Snowflake is not configured (${err.missing.join(", ")} missing in this environment).`;
  }
  if (err instanceof SnowflakeDriverUnavailableError) {
    return "Snowflake credentials are set, but the query transport is not wired up in this deployment yet. See docs/INTEGRATIONS.md.";
  }
  return (err as Error).message;
}

function val(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtAddress(a: Address): string {
  const line2 = [a.city, a.state].filter(Boolean).join(", ");
  const parts = [a.name, a.address, [line2, a.zip].filter(Boolean).join(" ")]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join("\n") : "—";
}

export default async function AssociationsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (id) return <AssociationDetail id={id} />;
  return <AssociationList />;
}

async function AssociationList() {
  let associations: AssociationSummary[] | null = null;
  let errorMessage: string | null = null;

  try {
    associations = await listAssociations();
  } catch (err) {
    errorMessage = describeError(err);
  }

  return (
    <main className="container wide">
      <div className="header">
        <div>
          <p className="crumb">
            <Link href="/">← Compliance</Link>
          </p>
          <h1 className="title">Associations (HOA)</h1>
        </div>
        <span className="badge">
          <span className="status ok" /> ResiAIMS · Snowflake
        </span>
      </div>

      <p className="subtitle">
        HOA / association records extracted from ResiAIMS — management company,
        contacts, amenities, access codes, inspections, and the properties
        mapped to each association.
      </p>

      {errorMessage && (
        <div className="card error">
          <h2>Could not load associations</h2>
          <p>{errorMessage}</p>
        </div>
      )}

      {associations && associations.length === 0 && (
        <p className="empty">No associations found.</p>
      )}

      {associations && associations.length > 0 && (
        <section className="panel">
          <div className="table-scroll">
            <table className="ptable">
              <thead>
                <tr>
                  <th>Association</th>
                  <th>Status</th>
                  <th>Management company</th>
                  <th>City</th>
                  <th>State</th>
                  <th className="num">Properties</th>
                </tr>
              </thead>
              <tbody>
                {associations.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/associations?id=${encodeURIComponent(a.id)}`}>
                        {a.name || `(association ${a.id})`}
                      </Link>
                    </td>
                    <td>{val(a.status)}</td>
                    <td>{val(a.managementCompany)}</td>
                    <td>{val(a.city)}</td>
                    <td>{val(a.state)}</td>
                    <td className="num">{a.propertyCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

async function AssociationDetail({ id }: { id: string }) {
  let assoc: Association | null = null;
  let errorMessage: string | null = null;

  try {
    assoc = await getAssociation(id);
  } catch (err) {
    errorMessage = describeError(err);
  }

  return (
    <main className="container wide">
      <div className="header">
        <div>
          <p className="crumb">
            <Link href="/associations">← Associations</Link>
          </p>
          <h1 className="title">{assoc?.name || `Association ${id}`}</h1>
        </div>
        {assoc?.status && (
          <span className="badge">
            <span className="status ok" /> {assoc.status}
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="card error">
          <h2>Could not load association</h2>
          <p>{errorMessage}</p>
        </div>
      )}

      {!errorMessage && !assoc && (
        <p className="empty">No association found for id {id}.</p>
      )}

      {assoc && (
        <>
          {/* HOA tab */}
          <h2 className="section-title">HOA</h2>
          <section className="panel detail-grid">
            <div>
              <span className="field-label">Status</span>
              <span>{val(assoc.status)}</span>
            </div>
            <div>
              <span className="field-label">Fax</span>
              <span>{val(assoc.fax)}</span>
            </div>
            <div>
              <span className="field-label">EIN / TaxID</span>
              <span>{val(assoc.einTaxId)}</span>
            </div>
            <div>
              <span className="field-label">Invoice recovery</span>
              <span>{val(assoc.invoiceRecovery)}</span>
            </div>
            <div>
              <span className="field-label">Management company</span>
              <span>{val(assoc.managementCompany)}</span>
            </div>
            <div>
              <span className="field-label">Management company POCs</span>
              <span>
                {assoc.managementPocs.length
                  ? assoc.managementPocs.join(" · ")
                  : "—"}
              </span>
            </div>
            <div>
              <span className="field-label">Physical address</span>
              <span className="preline">{fmtAddress(assoc.physicalAddress)}</span>
            </div>
            <div>
              <span className="field-label">Local mailing address</span>
              <span className="preline">{fmtAddress(assoc.mailingAddress)}</span>
            </div>
          </section>

          {/* Points of contact */}
          <h2 className="section-title">Points of contact</h2>
          <Table
            head={["Name", "Title", "Email", "Phone", "Ext"]}
            rows={assoc.pointsOfContact.map((c) => [
              val(c.name),
              val(c.title),
              val(c.email),
              val(c.phone),
              val(c.ext),
            ])}
            empty="No points of contact"
          />

          {/* Amenities */}
          <h2 className="section-title">Amenities</h2>
          <Table
            head={["Amenity", "Description"]}
            rows={assoc.amenities.map((a) => [val(a.name), val(a.description)])}
            empty="No amenities"
          />

          {/* Access codes */}
          <h2 className="section-title">Access codes</h2>
          <Table
            head={["Label", "Code", "Notes"]}
            rows={assoc.accessCodes.map((a) => [
              val(a.label),
              val(a.code),
              val(a.notes),
            ])}
            empty="No access codes"
          />

          {/* Inspections */}
          <h2 className="section-title">Inspections</h2>
          <Table
            head={["Type", "Status", "Scheduled", "Completed", "Result"]}
            rows={assoc.inspections.map((i) => [
              val(i.type),
              val(i.status),
              fmtDate(i.scheduledDate),
              fmtDate(i.completedDate),
              val(i.result),
            ])}
            empty="No inspections"
          />

          {/* Mapped properties */}
          <h2 className="section-title">
            Properties in this association (
            {assoc.properties.length.toLocaleString()})
          </h2>
          <Table
            head={["Property ID", "Address", "City", "State", "ZIP", "Status"]}
            rows={assoc.properties.map((p) => [
              val(p.id),
              val(p.address),
              val(p.city),
              val(p.state),
              val(p.zip),
              val(p.status),
            ])}
            empty="No properties mapped to this association"
          />
        </>
      )}
    </main>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <section className="panel">
      <div className="table-scroll">
        <table className="ptable">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
